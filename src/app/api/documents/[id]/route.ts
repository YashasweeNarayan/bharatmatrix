import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { indexDocument } from "@/lib/indexDocument";

export const runtime = "nodejs";
// See the comment in /api/matrix/route.ts — same static-caching gotcha.
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized();
    throw err;
  }

  // Scoping by user_id in the same query (rather than fetching by id
  // alone and checking ownership after) means a document that exists
  // but belongs to someone else looks exactly like one that doesn't
  // exist — no signal is leaked either way.
  const [doc] = await sql`
    select id, filename, mime_type, blob_url, status, page_count, error, created_at
    from documents where id = ${params.id} and user_id = ${user.id}
  `;
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pages = await sql`
    select ordinal, page_label, content
    from document_pages
    where document_id = ${params.id}
    order by ordinal asc
  `;

  return NextResponse.json({ document: doc, pages });
}

// Retries a document stuck in 'failed'. Two genuinely different cases
// hide behind that one status, and they need different fixes:
//
// 1. It failed AFTER extraction succeeded (a transient Gemini rate
//    limit while embedding a chunk, say) — document_chunks already has
//    rows. Any chunk that already got a vector keeps it; this just
//    flips status back so /api/documents/embed-step picks the
//    still-null ones back up.
// 2. It failed DURING extraction itself (e.g. the pdf.worker.mjs
//    bundling bug from 2026-11-13) — document_chunks has ZERO rows for
//    it, because chunking never ran. The old version of this handler
//    didn't check for this: "0 chunks have a null embedding" is
//    trivially true when there are 0 chunks at all, so it was marking
//    these documents 'ready' with no content ever indexed and no
//    error shown — status looked fine, search just silently found
//    nothing. Fixed by re-running the full extraction pipeline (same
//    indexDocument() the initial upload uses) against the file's
//    stored blob when there's nothing to resume.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized();
    throw err;
  }

  const [owned] = await sql`
    select id, blob_url, mime_type, filename from documents
    where id = ${params.id} and user_id = ${user.id}
  `;
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ total, remaining }] = await sql`
    select count(*)::int as total,
           count(*) filter (where embedding is null)::int as remaining
    from document_chunks
    where document_id = ${params.id}
  `;

  if (total === 0) {
    // Extraction never completed last time — redo it from scratch.
    let buffer: Buffer;
    try {
      const res = await fetch(owned.blob_url as string);
      if (!res.ok) throw new Error(`Blob fetch failed (${res.status}).`);
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sql`
        update documents
        set status = 'failed',
            error = ${"Couldn't re-fetch the stored file to retry: " + message}
        where id = ${params.id}
      `;
      return NextResponse.json({ error: message }, { status: 500 });
    }
    await sql`update documents set status = 'processing' where id = ${params.id}`;
    await indexDocument(
      params.id,
      buffer,
      owned.mime_type as string,
      owned.filename as string,
    );
    return NextResponse.json({ ok: true });
  }

  await sql`
    update documents
    set status = ${remaining > 0 ? "embedding" : "ready"}, error = null
    where id = ${params.id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return unauthorized();
    throw err;
  }

  await sql`
    delete from documents where id = ${params.id} and user_id = ${user.id}
  `;
  return NextResponse.json({ ok: true });
}
