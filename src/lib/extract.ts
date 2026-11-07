import mammoth from "mammoth";
import * as XLSX from "xlsx";
import path from "path";
// pdf-parse 1.1.1 (the previous dependency here) bundles its own ancient,
// pre-worker pdf.js fork with shared/global parsing state, and a simple
// in-process serialization queue around it (an earlier version of this
// file) did NOT fix the problem: the same PDF kept failing with different,
// nonsensical parser errors ("bad XRef entry" vs "Invalid number: p" vs
// "Invalid number: -") across repeated upload attempts of an identical
// file set that both `qpdf --check` and a modern, standalone pdfjs-dist
// parsed without any error every time. That points at pdf-parse's bundled
// fork itself being unreliable, not just a concurrency bug on top of it.
// So this now depends on pdfjs-dist directly — the actively maintained,
// official PDF.js package — instead of pdf-parse's frozen 2018-era copy
// of it. The "legacy/build" entry point is pdfjs-dist's own
// Node-compatible (no DOM/canvas) build.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

export type ExtractedPage = {
  ordinal: number;
  label: string;
  content: string;
};

export type ExtractResult = {
  pages: ExtractedPage[];
};

// Lets pdf.js resolve glyph metrics for the 14 standard PDF fonts (the
// Helvetica family this project's own generated PDFs use, among others)
// from its own bundled data instead of trying to reach the network for
// it, which wouldn't be reachable from a locked-down serverless function
// anyway. Built from process.cwd() + the known node_modules layout
// rather than require.resolve(), so it doesn't depend on how Next's
// bundler rewrites a require() call for a package's non-entry files.
const STANDARD_FONT_DATA_URL =
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") +
  path.sep;

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

type TextContentItem = { str?: string; hasEOL?: boolean };

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // pdf.js wants its own Uint8Array, and — important for a function that
  // may be reused across requests in the same warm instance — a COPY of
  // the buffer's bytes, not a view into it. A view (new Uint8Array(buffer.buffer, ...))
  // shares memory with the Buffer and would let pdf.js's internal
  // mutation of parsed data alias across concurrent calls in the same
  // process; a copy makes each parse fully independent.
  const data = new Uint8Array(buffer.length);
  data.set(buffer);

  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    useSystemFonts: true,
  });

  const pages: ExtractedPage[] = [];
  try {
    const doc = await loadingTask.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const text = (textContent.items as TextContentItem[])
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ ordinal: i, label: String(i), content: text });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }

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
