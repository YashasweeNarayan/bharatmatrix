import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  burnPasswordCheck,
  createSession,
  isAdminEmail,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { sameOrigin } from "@/lib/security";
import {
  buildLimits,
  clearAttempts,
  isLimited,
  limitedResponse,
  recordAttempt,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

// Deliberately the same message whether the email doesn't exist or the
// password is wrong — telling an attacker which one they got right is
// a free account-enumeration oracle.
const INVALID = "Incorrect email or password.";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const limits = buildLimits("login", req, email);
  if (await isLimited(limits)) return limitedResponse();

  if (!email || !password || password.length > 200) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const rows = await sql`
    select id, email, password_hash, role from users where email = ${email}
  `;
  // Admin accounts sign in only through /admin/login, so an admin email
  // here is treated exactly like an unknown one.
  const user = rows[0];
  const adminAccount = user && (user.role === "admin" || isAdminEmail(email));
  if (!user || adminAccount || !user.password_hash) {
    await burnPasswordCheck(password);
    await recordAttempt(limits);
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.password_hash as string);
  if (!ok) {
    await recordAttempt(limits);
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  await clearAttempts(limits.slice(0, 1));
  const { token, expiresAt } = await createSession(user.id as string);
  const res = NextResponse.json({ user: { id: user.id, email: user.email } });
  setSessionCookie(res, token, expiresAt);
  return res;
}
