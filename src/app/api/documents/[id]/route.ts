import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  await sql`delete from documents where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
