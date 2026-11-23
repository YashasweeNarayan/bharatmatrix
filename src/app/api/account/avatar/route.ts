import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB — plenty for a profile picture
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Stores an uploaded profile picture in Vercel Blob (same mechanism the
 * document upload already uses). There's no Google sign-in in this app,
 * so this is the only way a picture ever gets set — nothing here pulls a
 * photo automatically from Gmail or anywhere else.
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

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Use a PNG, JPEG or WEBP image." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large — keep it under 3MB." },
      { status: 400 },
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = await put(`avatars/${user.id}-${randomUUID()}.${ext}`, buffer, {
    access: "public",
    contentType: file.type,
  });

  await sql`update users set avatar_url = ${blob.url} where id = ${user.id}`;

  return NextResponse.json({ avatarUrl: blob.url });
}

export async function DELETE(req: NextRequest) {
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

  await sql`update users set avatar_url = null where id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
