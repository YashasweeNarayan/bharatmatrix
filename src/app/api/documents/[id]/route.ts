import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
// See the comment in /api/matrix/route.ts — same static-caching gotcha.
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();

  const [doc] = await sql`
    select id, filename, mime_type, blob_url, status, page_count, error, created_at
    from documents where id = ${params.id}
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
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();

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
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  await sql`delete from documents where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
