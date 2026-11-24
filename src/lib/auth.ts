import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const SESSION_COOKIE = "bm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Admin sessions are deliberately short: an unattended, signed-in admin
// browser is the most valuable thing an attacker could find.
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export type AuthMethod = "password" | "google";

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  /** True only for a session created through the admin login flow, for an
   *  email that is (still) in ADMIN_EMAILS. */
  isAdmin: boolean;
  authMethod: AuthMethod;
  sessionCreatedAt: Date;
};

/** Emails allowed to be admins. The single source of truth is this env var,
 *  so removing an email here instantly revokes that person's admin access
 *  on their very next request, whatever is stored in the database. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}

let dummyHash: Promise<string> | null = null;
/**
 * Verify against a throwaway hash when the email doesn't exist, so a
 * login for an unknown email takes as long as one for a real email —
 * otherwise response time reveals which emails have accounts.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash("not-a-real-password", 12);
  await bcrypt.compare(password, await dummyHash);
}

export async function hashPassword(password: string): Promise<string> {
  // 12 rounds is a reasonable, widely-used default for interactive
  // (not embedded/offline) auth — slow enough to resist brute-forcing a
  // stolen hash, fast enough not to be felt on a normal login request.
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Opaque, unguessable — nothing about the user is derivable from it. */
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(
  userId: string,
  opts: { admin?: boolean; method?: AuthMethod } = {},
): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const admin = opts.admin ?? false;
  const method = opts.method ?? "password";
  const expiresAt = new Date(
    Date.now() + (admin ? ADMIN_SESSION_TTL_MS : SESSION_TTL_MS),
  );
  await sql`
    insert into sessions (token, user_id, expires_at, is_admin, auth_method)
    values (${token}, ${userId}, ${expiresAt}, ${admin}, ${method})
  `;
  await sql`update users set last_login_at = now() where id = ${userId}`;
  return { token, expiresAt };
}

/** Sign out everywhere except (optionally) one session — used after a
 *  password change or reset so a stolen session can't outlive it. */
export async function destroyOtherSessions(
  userId: string,
  keepToken?: string,
): Promise<void> {
  if (keepToken) {
    await sql`delete from sessions where user_id = ${userId} and token <> ${keepToken}`;
  } else {
    await sql`delete from sessions where user_id = ${userId}`;
  }
}

export async function destroySession(token: string): Promise<void> {
  await sql`delete from sessions where token = ${token}`;
}

/**
 * Looks a session token up and resolves the user it belongs to, or null
 * if the token is missing, invalid, or expired. Expired sessions are
 * deleted lazily here rather than needing a cron job. Shared by both
 * API routes (which have the token via NextRequest's cookies) and
 * server components (which read it via next/headers' cookies()).
 */
export async function getUserByToken(
  token: string | undefined,
): Promise<AuthUser | null> {
  if (!token) return null;

  const rows = await sql`
    select u.id, u.email, u.username, u.avatar_url, u.role,
           s.expires_at, s.is_admin, s.auth_method, s.created_at
    from sessions s
    join users u on u.id = s.user_id
    where s.token = ${token}
  `;
  if (rows.length === 0) return null;

  const row = rows[0];
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }

  const email = row.email as string;
  const role = row.role === "admin" ? "admin" : "user";
  return {
    id: row.id as string,
    email,
    username: (row.username as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    role,
    // All three must hold: an admin-flagged session, an admin role row, and
    // the email still being on the env allow-list.
    isAdmin: Boolean(row.is_admin) && role === "admin" && isAdminEmail(email),
    authMethod: row.auth_method === "google" ? "google" : "password",
    sessionCreatedAt: new Date(row.created_at as string),
  };
}

/** For use in API routes, which get the cookie off the NextRequest. */
export async function getSessionUser(
  req: NextRequest,
): Promise<AuthUser | null> {
  return getUserByToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/**
 * httpOnly so page JavaScript can never read the token (blocks XSS
 * token theft); secure outside local dev so it's never sent over plain
 * HTTP; sameSite "lax" is enough CSRF protection for a same-site app
 * with no cross-site form posts.
 */
export function setSessionCookie(
  res: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Thrown by requireUser; routes catch it and return 401. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "UnauthorizedError";
  }
}

/** Resolves the logged-in user, or throws UnauthorizedError. */
export async function requireUser(req: NextRequest): Promise<AuthUser> {
  const user = await getSessionUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Resolves the logged-in admin, or throws UnauthorizedError (401) /
 *  ForbiddenError (403) so a plain user learns nothing about admin routes
 *  beyond "no". */
export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden.");
    this.name = "ForbiddenError";
  }
}

export async function requireAdmin(req: NextRequest): Promise<AuthUser> {
  const user = await requireUser(req);
  if (!user.isAdmin) throw new ForbiddenError();
  return user;
}
