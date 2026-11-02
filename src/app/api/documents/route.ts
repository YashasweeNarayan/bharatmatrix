import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { extractDocument } from "@/lib/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await ensureSchema();
  const documents = await sql`
    select id, filename, mime_type, status, page_count, error, created_at
    from documents
    order by created_at desc
  `;
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data upload." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const blobPathname = `documents/${randomUUID()}-${file.name}`;

  let blobUrl: string;
  try {
    const blob = await put(blobPathname, buffer, {
      access: "public",
      contentType: file.type || "application/octet-stream",
    });
    blobUrl = blob.url;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Couldn't store the file — check that a Blob store is connected " +
          "to this Vercel project.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const [doc] = await sql`
    insert into documents (filename, mime_type, blob_url, status)
    values (${file.name}, ${file.type || "application/octet-stream"}, ${blobUrl}, 'processing')
    returning id
  `;

  try {
    const { pages } = await extractDocument(
      buffer,
      file.type || "",
      file.name,
    );

    await sql.begin(async (tx) => {
      for (const page of pages) {
        await tx`
          insert into document_pages (document_id, ordinal, page_label, content)
          values (${doc.id}, ${page.ordinal}, ${page.label}, ${page.content})
        `;
      }
      await tx`
        update documents set status = 'ready', page_count = ${pages.length}
        where id = ${doc.id}
      `;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update documents set status = 'failed', error = ${message}
      where id = ${doc.id}
    `;
    return NextResponse.json(
      { error: message, documentId: doc.id },
      { status: 207 },
    );
  }

  return NextResponse.json({ documentId: doc.id });
}
