import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { createSession, isAdminEmail, setSessionCookie } from "@/lib/auth";
import {
  GOOGLE_STATE_COOKIE,
  appOrigin,
  exchangeCode,
  googleConfigured,
} from "@/lib/google";
import { constantTimeEqual, safeNextPath } from "@/lib/security";

export const runtime = "nodejs";

function fail(req: NextRequest, mode: string, code: string) {
  const page = mode === "admin" ? "/admin/login" : "/login";
  const res = NextResponse.redirect(`${appOrigin(req)}${page}?error=${code}`);
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  if (!googleConfigured()) return fail(req, "user", "google_off");

  let saved: { state: string; mode: string; next: string } | null = null;
  try {
    saved = JSON.parse(req.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? "null");
  } catch {
    saved = null;
  }
  const mode = saved?.mode === "admin" ? "admin" : "user";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  if (!saved || !code || !constantTimeEqual(state, saved.state)) {
    return fail(req, mode, "google_failed");
  }

  const identity = await exchangeCode(req, code).catch(() => null);
  if (!identity) return fail(req, mode, "google_failed");

  await ensureSchema();
  const email = identity.email;
  const adminEmail = isAdminEmail(email);

  if (mode === "admin" && !adminEmail) return fail(req, mode, "not_admin");
  if (mode === "user" && adminEmail) return fail(req, mode, "use_admin");

  const found = await sql`select id, role from users where email = ${email}`;
  let userId: string;
  if (found.length > 0) {
    userId = found[0].id as string;
    if (mode === "admin" && found[0].role !== "admin") {
      await sql`update users set role = 'admin' where id = ${userId}`;
    }
  } else {
    const [u] = await sql`
      insert into users (email, password_hash, role)
      values (${email}, null, ${mode === "admin" ? "admin" : "user"})
      returning id
    `;
    userId = u.id as string;
  }

  const { token, expiresAt } = await createSession(userId, {
    admin: mode === "admin",
    method: "google",
  });
  if (mode === "admin") {
    await sql`
      insert into admin_audit (admin_id, admin_email, action)
      values (${userId}, ${email}, 'login_google')
    `;
  }
  const dest = mode === "admin" ? "/admin/history" : safeNextPath(saved.next);
  const res = NextResponse.redirect(`${appOrigin(req)}${dest}`);
  setSessionCookie(res, token, expiresAt);
  res.cookies.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  return res;
}
