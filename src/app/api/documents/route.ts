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

// The upload UI now sends files to this route one at a time (see the
// comment in Workspace.tsx's uploadFiles for why), which removes the
// concurrency that was corrupting uploads. This lock is defense in
// depth on top of that: if several browser tabs, or several people,
// ever upload at once, requests landing on the same warm Vercel
// instance still get serialized through req.formData()'s multipart
// parsing and the raw buffer read, one at a time, rather than racing.
let uploadLock: Promise<unknown> = Promise.resolve();
function withUploadLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = uploadLock.then(fn, fn);
  uploadLock = result.catch(() => {});
  return result;
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  let buffer: Buffer;
  let file: File;
  try {
    const parsed = await withUploadLock(async () => {
      const fd = await req.formData();
      const f = fd.get("file");
      if (!(f instanceof File)) {
        throw new Error("NO_FILE");
      }
      const buf = Buffer.from(await f.arrayBuffer());
      return { f, buf };
    });
    file = parsed.f;
    buffer = parsed.buf;
  } catch (err) {
    if (err instanceof Error && err.message === "NO_FILE") {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Expected a multipart/form-data upload." },
      { status: 400 },
    );
  }
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
