import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  SESSION_COOKIE,
  requireUser,
  UnauthorizedError,
  destroyOtherSessions,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { passwordProblem, sameOrigin } from "@/lib/security";
import {
  buildLimits,
  clearAttempts,
  isLimited,
  limitedResponse,
  recordAttempt,
} from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A Google sign-in this recent counts as proof of identity, so the
// "forgot password" path (sign in with Google, then set a new password)
// doesn't need the old one.
const RECENT_GOOGLE_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
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
  const currentPassword = body?.currentPassword;
  const newPassword = body?.newPassword;

  if (typeof newPassword !== "string") {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }
  const problem = passwordProblem(newPassword, { email: user.email });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const [row] = await sql`select password_hash from users where id = ${user.id}`;
  const recentGoogle =
    user.authMethod === "google" &&
    Date.now() - user.sessionCreatedAt.getTime() < RECENT_GOOGLE_MS;
  const hasPassword = Boolean(row?.password_hash);

  if (!recentGoogle && hasPassword) {
    const limits = buildLimits("login", req, user.email);
    if (await isLimited(limits)) return limitedResponse();
    const ok =
      typeof currentPassword === "string" &&
      (await verifyPassword(currentPassword, row.password_hash as string));
    if (!ok) {
      await recordAttempt(limits);
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 401 },
      );
    }
    await clearAttempts(limits.slice(0, 1));
  } else if (!recentGoogle && !hasPassword) {
    return NextResponse.json(
      { error: "Sign in with Google again to set a password." },
      { status: 403 },
    );
  }

  const newHash = await hashPassword(newPassword);
  await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
  // Every other device is signed out, so a stolen session can't outlive
  // the password change.
  await destroyOtherSessions(user.id, req.cookies.get(SESSION_COOKIE)?.value);

  return NextResponse.json({ ok: true });
}
