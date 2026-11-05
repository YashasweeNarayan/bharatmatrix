import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resets every document chunk's stored embedding to null and every
 * document (other than one still mid-extraction) back to 'embedding'
 * status, so the currently active provider (src/lib/embeddings.ts) picks
 * them all up and re-indexes from scratch.
 *
 * Call this ONCE, manually, right after switching the provider in
 * src/lib/embeddings.ts — in either direction. Switching providers makes
 * every already-stored vector invalid (different vector space, even when
 * both are sized to the same 768 dimensions), so searches would silently
 * mix two providers' vectors without this reset. Not called
 * automatically by anything — this is a deliberate, manually-triggered
 * action tied to a provider swap, not routine maintenance.
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
