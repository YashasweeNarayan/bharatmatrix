import { sql } from "@/lib/db";
import { extractDocument } from "@/lib/extract";
import { chunkPages } from "@/lib/chunk";

/**
 * Runs the full extract -> chunk -> status pipeline for a document whose
 * row already exists and whose file bytes are in hand. Shared by the
 * initial upload (/api/documents POST) and by retrying a document that
 * failed before it ever produced any pages/chunks (/api/documents/[id]
 * PATCH) — those two cases need the exact same work, just with the
 * bytes coming from a fresh upload vs. re-fetched from blob storage.
 *
 * Sets the document to 'failed' with the error message on failure;
 * leaves it at 'embedding' or 'ready' (page_count always set) on
 * success. Throws nothing — callers just check the resulting status if
 * they need to.
 */
export async function indexDocument(
  documentId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<void> {
  try {
    const { pages } = await extractDocument(buffer, mimeType, filename);

    await sql.begin(async (tx) => {
      for (const page of pages) {
        await tx`
          insert into document_pages (document_id, ordinal, page_label, content)
          values (${documentId}, ${page.ordinal}, ${page.label}, ${page.content})
        `;
      }
    });

    // Chunk now, but deliberately do NOT embed here (see embed-step for
    // why — a single request embedding everything at once risked both
    // the platform's duration cap and Gemini's per-minute rate limit).
    const chunks = chunkPages(
      pages.map((p) => ({ label: p.label, content: p.content })),
    );

    await sql.begin(async (tx) => {
      for (const chunk of chunks) {
        await tx`
          insert into document_chunks (document_id, ordinal, page_label, content)
          values (${documentId}, ${chunk.ordinal}, ${chunk.pageLabel}, ${chunk.content})
        `;
      }
      await tx`
        update documents
        set status = ${chunks.length > 0 ? "embedding" : "ready"},
            page_count = ${pages.length},
            error = null
        where id = ${documentId}
      `;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update documents set status = 'failed', error = ${message}
      where id = ${documentId}
    `;
  }
}
