import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import type { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const SESSION_COOKIE = "bm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type AuthUser = {
  id: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
};

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

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${userId}, ${expiresAt})
  `;
  return { token, expiresAt };
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
    select u.id, u.email, u.username, u.avatar_url, s.expires_at
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

  return {
    id: row.id as string,
    email: row.email as string,
    username: (row.username as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
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
