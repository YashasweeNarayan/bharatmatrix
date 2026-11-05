import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resets every document chunk's stored embedding to null and every
 * document (other than one still mid-extraction) back to 'embedding'
 * status, so Gemini re-indexes everything from scratch on the next
 * drain.
 *
 * Needed right now (2026-11-06): some documents were briefly re-embedded
 * with OpenRouter/Nemotron vectors while that was active (see
 * PROGRESS.md) before the switch was reverted. Those vectors aren't
 * comparable to Gemini's — different vector space even at the same 768
 * dimensions — so this must be called once to clear them and let Gemini
 * re-index cleanly. Not called automatically by anything; a deliberate,
 * manually-triggered reset, not routine maintenance.
 *
 * Easiest way to call it: open the deployed site, open the browser
 * console, and run:
 *   fetch('/api/documents/reembed', { method: 'POST' }).then(r => r.json()).then(console.log)
 * or from a terminal: curl -X POST https://bharatmatrix.vercel.app/api/documents/reembed
 */
export async function POST() {
  await ensureSchema();

  const [{ cleared }] = await sql`
    with updated as (
      update document_chunks set embedding = null
      where embedding is not null
      returning 1
    )
    select count(*)::int as cleared from updated
  `;

  const [{ reset }] = await sql`
    with updated as (
      update documents
      set status = 'embedding', error = null
      where status in ('ready', 'failed', 'embedding')
      returning 1
    )
    select count(*)::int as reset from updated
  `;

  return NextResponse.json({ clearedChunks: cleared, resetDocuments: reset });
}
