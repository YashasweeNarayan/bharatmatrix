import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resets every document chunk's stored embedding to null and every
 * document (other than one still mid-extraction) back to 'embedding'
 * status, so Gemini re-indexes everything from scratch on the next
 * drain.
 *
 * Needed once (2026-11-06): some documents were briefly re-embedded
 * with OpenRouter/Nemotron vectors while that was active (see
 * PROGRESS.md) before the switch was reverted. Those vectors aren't
 * comparable to Gemini's — different vector space even at the same 768
 * dimensions — so this must be called once to clear them and let Gemini
 * re-index cleanly. Not called automatically by anything; a deliberate,
 * manually-triggered reset, not routine maintenance.
 *
 * Scoped to the signed-in caller's own documents only (added alongside
 * multi-user auth) — without that, any logged-in user calling this
 * would reset every other user's embeddings too.
 *
 * Easiest way to call it: open the deployed site while signed in, open
 * the browser console, and run:
 *   fetch('/api/documents/reembed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  const [{ cleared }] = await sql`
    with updated as (
      update document_chunks set embedding = null
      where embedding is not null
        and document_id in (select id from documents where user_id = ${user.id})
      returning 1
    )
    select count(*)::int as cleared from updated
  `;

  const [{ reset }] = await sql`
    with updated as (
      update documents
      set status = 'embedding', error = null
      where status in ('ready', 'failed', 'embedding') and user_id = ${user.id}
      returning 1
    )
    select count(*)::int as reset from updated
  `;

  return NextResponse.json({ clearedChunks: cleared, resetDocuments: reset });
}
