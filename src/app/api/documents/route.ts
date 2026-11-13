import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { indexDocument } from "@/lib/indexDocument";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;
// See the comment in /api/matrix/route.ts — same static-caching gotcha.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
  const documents = await sql`
    select id, filename, mime_type, status, page_count, error, created_at
    from documents
    where user_id = ${user.id}
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

  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

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
    insert into documents (filename, mime_type, blob_url, status, user_id)
    values (${file.name}, ${file.type || "application/octet-stream"}, ${blobUrl}, 'processing', ${user.id})
    returning id
  `;

  await indexDocument(doc.id as string, buffer, file.type || "", file.name);

  const [result] = await sql`
    select status, error from documents where id = ${doc.id}
  `;
  if (result.status === "failed") {
    return NextResponse.json(
      { error: result.error, documentId: doc.id },
      { status: 207 },
    );
  }

  return NextResponse.json({ documentId: doc.id });
}
