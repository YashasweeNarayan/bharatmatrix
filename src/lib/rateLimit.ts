import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { clientIp, hashKey } from "@/lib/security";

/**
 * Database-backed attempt counters (serverless instances don't share
 * memory, so an in-memory Map would reset on every cold start and be
 * useless against a patient attacker).
 *
 * Two buckets per kind of attempt: one per email (stops guessing at one
 * account from many IPs) and one per IP (stops one machine trying many
 * accounts). Failed logins are recorded; a successful login clears that
 * email's counter.
 */
export type Limit = { bucket: string; max: number; windowMs: number };

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export type AttemptKind = "login" | "adminLogin" | "adminSetup" | "signup";

export function buildLimits(
  kind: AttemptKind,
  req: NextRequest,
  email?: string,
): Limit[] {
  const ip = hashKey(clientIp(req));
  const e = email ? hashKey(email.toLowerCase()) : null;
  switch (kind) {
    case "login":
      return [
        ...(e ? [{ bucket: `login:e:${e}`, max: 5, windowMs: FIFTEEN_MIN }] : []),
        { bucket: `login:i:${ip}`, max: 20, windowMs: FIFTEEN_MIN },
      ];
    case "adminLogin":
      return [
        ...(e ? [{ bucket: `alogin:e:${e}`, max: 4, windowMs: FIFTEEN_MIN }] : []),
        { bucket: `alogin:i:${ip}`, max: 10, windowMs: FIFTEEN_MIN },
      ];
    case "adminSetup":
      return [
        ...(e ? [{ bucket: `asetup:e:${e}`, max: 5, windowMs: FIFTEEN_MIN }] : []),
        { bucket: `asetup:i:${ip}`, max: 8, windowMs: FIFTEEN_MIN },
      ];
    case "signup":
      return [{ bucket: `signup:i:${ip}`, max: 10, windowMs: ONE_HOUR }];
  }
}

export async function isLimited(limits: Limit[]): Promise<boolean> {
  for (const l of limits) {
    const since = new Date(Date.now() - l.windowMs);
    const rows = await sql`
      select count(*)::int as n from auth_attempts
      where bucket = ${l.bucket} and created_at > ${since}
    `;
    if (((rows[0]?.n as number | undefined) ?? 0) >= l.max) return true;
  }
  return false;
}

export async function recordAttempt(limits: Limit[]): Promise<void> {
  for (const l of limits) {
    await sql`insert into auth_attempts (bucket) values (${l.bucket})`;
  }
  // Housekeeping: now and then drop rows no window could still need.
  if (Math.random() < 0.02) {
    await sql`delete from auth_attempts where created_at < now() - interval '1 day'`;
  }
}

export async function clearAttempts(limits: Limit[]): Promise<void> {
  for (const l of limits) {
    await sql`delete from auth_attempts where bucket = ${l.bucket}`;
  }
}

export function limitedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Try again in 15 minutes." },
    { status: 429, headers: { "Retry-After": "900" } },
  );
}
