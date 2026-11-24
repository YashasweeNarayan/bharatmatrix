import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  createSession,
  hashPassword,
  isAdminEmail,
  setSessionCookie,
} from "@/lib/auth";
import { passwordProblem, sameOrigin } from "@/lib/security";
import {
  buildLimits,
  isLimited,
  limitedResponse,
  recordAttempt,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
  await ensureSchema();

  const limits = buildLimits("signup", req);
  if (await isLimited(limits)) return limitedResponse();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const problem = passwordProblem(password, { email });
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  await recordAttempt(limits);

  // Admin emails can't be registered as ordinary accounts (stops anyone
  // squatting an admin address before its owner sets it up).
  const existing = await sql`select id from users where email = ${email}`;
  if (existing.length > 0 || isAdminEmail(email)) {
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
