import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Updates the display name shown in the header and sidebar. */
export async function PATCH(req: NextRequest) {
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

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : undefined;

  if (username === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  if (username.length > 40) {
    return NextResponse.json(
      { error: "Username is too long (40 characters max)." },
      { status: 400 },
    );
  }

  await sql`
    update users set username = ${username || null} where id = ${user.id}
  `;

  return NextResponse.json({ username: username || null });
}
