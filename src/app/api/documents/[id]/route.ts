import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

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

// Retries a document stuck in 'failed' — most commonly a transient Gemini
// rate-limit that (before this fix) incorrectly marked the whole document
// permanently failed. Any chunks that already got embedded keep their
// vectors; only the still-null ones get picked up again by
// /api/documents/embed-step.
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
    select id from documents where id = ${params.id} and user_id = ${user.id}
  `;
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from document_chunks
    where document_id = ${params.id} and embedding is null
  `;

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
