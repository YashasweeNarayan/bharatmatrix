import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { hashPassword, isAdminEmail } from "@/lib/auth";
import { constantTimeEqual, passwordProblem, sameOrigin } from "@/lib/security";
import {
  buildLimits,
  isLimited,
  limitedResponse,
  recordAttempt,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * First-time admin password creation (alternative to Google sign-in).
 * Requires ALL of: the email is in ADMIN_EMAILS, the caller knows
 * ADMIN_SETUP_KEY (a secret only the deployer has), and that admin has
 * no password yet — so it can't be used to take over an existing admin.
 * With ADMIN_SETUP_KEY unset the route does not exist.
 */
export async function POST(req: NextRequest) {
  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const key = typeof body?.setupKey === "string" ? body.setupKey : "";

  const limits = buildLimits("adminSetup", req, email);
  if (await isLimited(limits)) return limitedResponse();

  const DENIED = "Setup was refused. Check the email and setup key.";
  const keyOk = constantTimeEqual(key, setupKey);
  if (!keyOk || !isAdminEmail(email)) {
    await recordAttempt(limits);
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }

  const problem = passwordProblem(password, { email, minLength: 12 });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const existing = await sql`
    select id, password_hash, role from users where email = ${email}
  `;
  const hash = await hashPassword(password);
  if (existing.length === 0) {
    const [u] = await sql`
      insert into users (email, password_hash, role)
      values (${email}, ${hash}, 'admin') returning id
    `;
    await sql`
      insert into admin_audit (admin_id, admin_email, action)
      values (${u.id as string}, ${email}, 'setup')
    `;
  } else if (!existing[0].password_hash || existing[0].role !== "admin") {
    // Existing ordinary/Google-only account being promoted by the deployer.
    await sql`
      update users set password_hash = ${hash}, role = 'admin'
      where id = ${existing[0].id as string}
    `;
    await sql`
      insert into admin_audit (admin_id, admin_email, action)
      values (${existing[0].id as string}, ${email}, 'setup')
    `;
  } else {
    await recordAttempt(limits);
    return NextResponse.json({ error: DENIED }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
