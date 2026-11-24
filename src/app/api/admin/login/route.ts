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

const INVALID = "Incorrect admin email or password.";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const limits = buildLimits("adminLogin", req, email);
  if (await isLimited(limits)) return limitedResponse();

  const rows = email
    ? await sql`
        select id, email, password_hash, role from users where email = ${email}
      `
    : [];
  const user = rows[0];
  const eligible =
    user &&
    user.role === "admin" &&
    isAdminEmail(email) &&
    Boolean(user.password_hash);

  if (!eligible || !password || password.length > 200) {
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
  const { token, expiresAt } = await createSession(user.id as string, {
    admin: true,
    method: "password",
  });
  await sql`
    insert into admin_audit (admin_id, admin_email, action)
    values (${user.id as string}, ${email}, 'login')
  `;
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, token, expiresAt);
  return res;
}
