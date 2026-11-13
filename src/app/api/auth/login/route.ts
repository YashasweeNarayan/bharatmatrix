import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

// Deliberately the same message whether the email doesn't exist or the
// password is wrong — telling an attacker which one they got right is
// a free account-enumeration oracle.
const INVALID = "Incorrect email or password.";

export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const rows = await sql`
    select id, email, password_hash from users where email = ${email}
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const user = rows[0];
  const ok = await verifyPassword(password, user.password_hash as string);
  if (!ok) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id as string);
  const res = NextResponse.json({ user: { id: user.id, email: user.email } });
  setSessionCookie(res, token, expiresAt);
  return res;
}
