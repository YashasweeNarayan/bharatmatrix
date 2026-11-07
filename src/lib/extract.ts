import mammoth from "mammoth";
import * as XLSX from "xlsx";
// Importing the internal module (not the package's `index.js`) is
// deliberate: pdf-parse's index.js has a debug block that runs at
// module-load time and tries to read a bundled test PDF from disk, which
// breaks once Next.js bundles this for a serverless function. The internal
// module skips that entirely. It also has no usable TS types; the ambient
// `declare module` in src/types/declarations.d.ts makes this default import
// resolve as `any`, narrowed with the local types below.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export type ExtractedPage = {
  ordinal: number;
  label: string;
  content: string;
};

export type ExtractResult = {
  pages: ExtractedPage[];
};

type PdfPageData = {
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
};

/**
 * Serializes every pdfParse() call within this server process to exactly
 * one at a time. pdf-parse 1.1.1 bundles a legacy, pre-worker pdf.js build
 * that was never designed to have multiple getDocument() calls in flight
 * concurrently in the same JS heap — it has internal shared/global parsing
 * state. Uploading several PDFs at once (Workspace.tsx uploads all
 * selected files via Promise.all) sends concurrent requests to
 * /api/documents, and if Vercel happens to route more than one onto the
 * same warm instance, their pdfParse() calls can interleave and corrupt
 * each other's in-flight parse state. Symptom confirmed in practice: the
 * exact same PDF failed with a different, nonsensical parser error
 * ("bad XRef entry" vs "Invalid number: p" vs "Invalid number: -") across
 * two separate upload attempts of the identical file set — the signature
 * of a race, not of a genuinely malformed file (qpdf --check and a modern
 * pdf.js both parsed every file in that set without any error). This
 * queue makes that race impossible by construction: whatever request
 * order requests arrive in, their pdfParse() calls run strictly one after
 * another within this process, never overlapping.
 */
let pdfParseQueue: Promise<unknown> = Promise.resolve();

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = pdfParseQueue.then(fn, fn);
  // Keep the queue chain alive regardless of whether this task succeeded
  // or failed, so one bad PDF doesn't permanently wedge every later one.
  pdfParseQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Pulls text out of a PDF, DOCX or XLSX buffer, split into "pages" — an
 * actual page for PDFs, the whole document for DOCX (Word has no fixed
 * pagination outside of rendering), one entry per sheet for XLSX.
 * This page/label split is what every evidence citation in the UI points at.
 */
export async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractResult> {
  const lower = filename.toLowerCase();

  if (mimeType.includes("pdf") || lower.endsWith(".pdf")) {
    return extractPdf(buffer);
  }
  if (mimeType.includes("wordprocessingml") || lower.endsWith(".docx")) {
    return extractDocx(buffer);
  }
  if (
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("excel") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    return extractXlsx(buffer);
  }

  // Fallback: treat anything else as plain text.
  const text = buffer.toString("utf-8").trim();
  if (!text) {
    throw new Error(
      "Unrecognized file type — upload a PDF, DOCX or XLSX file.",
    );
  }
  return { pages: [{ ordinal: 1, label: "1", content: text }] };
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const pages: ExtractedPage[] = [];
  let pageNum = 0;

  await runSerialized(() =>
    pdfParse(buffer, {
      pagerender: async (pageData: PdfPageData) => {
        pageNum += 1;
        const textContent = await pageData.getTextContent();
        const text = textContent.items
          .map((item) => item.str ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        pages.push({ ordinal: pageNum, label: String(pageNum), content: text });
        return text;
      },
    }),
  );

  const nonEmpty = pages.filter((p) => p.content.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error(
      "Couldn't find any extractable text in this PDF — it may be a scanned " +
        "image without OCR, which this version doesn't handle yet.",
    );
  }
  return { pages: nonEmpty };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const { value } = await mammoth.extractRawText({ buffer });
  const text = (value as string).replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error("Couldn't find any text in this document.");
  }
  return { pages: [{ ordinal: 1, label: "Full document", content: text }] };
}

async function extractXlsx(buffer: Buffer): Promise<ExtractResult> {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const pages: ExtractedPage[] = workbook.SheetNames.map((name, i) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    return { ordinal: i + 1, label: `Sheet: ${name}`, content: csv };
  }).filter((p) => p.content.length > 0);

  if (pages.length === 0) {
    throw new Error("Couldn't find any data in this spreadsheet.");
  }
  return { pages };
}
