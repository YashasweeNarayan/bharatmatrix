import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { extractDocument } from "@/lib/extract";
import { chunkPages } from "@/lib/chunk";

export const runtime = "nodejs";
export const maxDuration = 30;
// See the comment in /api/matrix/route.ts — same static-caching gotcha.
export const dynamic = "force-dynamic";

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
    });

    // Chunk now, but deliberately do NOT embed here (Step 3 used to). A
    // single request trying to embed every chunk of a 100+ page document
    // at once both risked the platform's request-duration limit and could
    // burst past Gemini's per-minute embedding rate limit on its own.
    // Chunks are inserted with no vector yet, status goes to 'embedding',
    // and /api/documents/embed-step embeds a small batch at a time,
    // driven by the client the same way Matrix cells are.
    const chunks = chunkPages(
      pages.map((p) => ({ label: p.label, content: p.content })),
    );

    await sql.begin(async (tx) => {
      for (const chunk of chunks) {
        await tx`
          insert into document_chunks (document_id, ordinal, page_label, content)
          values (${doc.id}, ${chunk.ordinal}, ${chunk.pageLabel}, ${chunk.content})
        `;
      }
      await tx`
        update documents
        set status = ${chunks.length > 0 ? "embedding" : "ready"},
            page_count = ${pages.length}
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
