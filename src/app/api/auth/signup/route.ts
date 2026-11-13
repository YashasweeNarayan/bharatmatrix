import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const existing = await sql`select id from users where email = ${email}`;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const [user] = await sql`
    insert into users (email, password_hash)
    values (${email}, ${passwordHash})
    returning id, email
  `;

  const { token, expiresAt } = await createSession(user.id as string);
  const res = NextResponse.json({ user: { id: user.id, email: user.email } });
  setSessionCookie(res, token, expiresAt);
  return res;
}
