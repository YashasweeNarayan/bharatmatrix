import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedTexts, isRateLimitError } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Raised back up now that embedTexts batches many chunks into a single
// Gemini request instead of one request per chunk (see gemini.ts) — the
// real fix for the rate limit, since the free-tier quota is metered per
// *request*, not per text. A batch of this size now costs Gemini a single
// request (its own internal batching caps at 50), so the limiting factor
// here is just staying inside the platform's request-duration budget for
// one embedContent call plus this many individual chunk writes, not
// request-count pressure against the per-minute cap.
const BATCH_SIZE = 50;

/**
 * Embeds one batch of chunks for one document per call. Documents go
 * 'processing' (extracting text) -> 'embedding' (chunked, not yet
 * searchable) -> 'ready'. The client drains this the same way it drains
 * /api/matrix/step: call, refresh, repeat until done. Each chunk's
 * embedding is written as soon as it succeeds (not batched into one
 * all-or-nothing update), so a partial batch still makes real progress if
 * this call gets cut off.
 */
export async function POST() {
  await ensureSchema();

  const [doc] = await sql`
    select id from documents
    where status = 'embedding'
    order by created_at asc
    limit 1
  `;

  if (doc) {
    const chunks = await sql`
      select id, content from document_chunks
      where document_id = ${doc.id} and embedding is null
      order by ordinal asc
      limit ${BATCH_SIZE}
    `;

    if (chunks.length === 0) {
      // Nothing left unembedded for this document — it's done.
      await sql`update documents set status = 'ready' where id = ${doc.id}`;
    } else {
      try {
        const vectors = await embedTexts(
          chunks.map((c) => c.content as string),
        );
        for (let i = 0; i < chunks.length; i++) {
          const vectorLiteral = JSON.stringify(vectors[i]);
          await sql`
            update document_chunks set embedding = ${vectorLiteral}::vector
            where id = ${chunks[i].id}
          `;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (isRateLimitError(err)) {
          // Transient: Gemini's per-minute embedding quota is full, not a
          // real failure. Leave the document as 'embedding' (not 'failed')
          // so the next /embed-step call just tries again — the client
          // drain loop paces its retries on this distinct rateLimited
          // flag rather than treating it as a hard stop.
          return NextResponse.json(
            {
              done: false,
              remaining: null,
              rateLimited: true,
              detail: message,
            },
            { status: 429 },
          );
        }

        await sql`
          update documents set status = 'failed', error = ${message}
          where id = ${doc.id}
        `;
        return NextResponse.json(
          { done: false, remaining: 0, error: "Embedding failed.", detail: message },
          { status: 500 },
        );
      }
    }
  }

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where d.status = 'embedding' and dc.embedding is null
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
