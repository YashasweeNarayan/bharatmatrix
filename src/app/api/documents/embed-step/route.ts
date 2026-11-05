import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  embedTexts,
  isRateLimitError,
  isDailyQuotaError,
} from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// Reverted back down: embedTexts no longer batches multiple chunks into
// one Gemini request (that assumption was wrong — see gemini.ts), so this
// is genuinely 1 real request per chunk again, at concurrency 3. Sized to
// finish comfortably inside the platform's hard ~10s function-duration
// cap, not to manage the Gemini quota (which, now confirmed to include a
// 1000/day cap, can't be helped by batch size at all — it's 1-request-
// per-chunk no matter how this number is set).
const BATCH_SIZE = 8;

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
          // Transient (or, for the daily cap, not transient within this
          // session but still not a real failure): leave the document as
          // 'embedding' (not 'failed') either way, so draining just
          // resumes naturally once the quota clears — a client restart
          // shouldn't need a manual retry. dailyLimit tells the client
          // not to bother looping on short backoffs for something that
          // won't clear for hours.
          return NextResponse.json(
            {
              done: false,
              remaining: null,
              rateLimited: true,
              dailyLimit: isDailyQuotaError(err),
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
