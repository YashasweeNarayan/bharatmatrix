import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Best-effort client IP. On Vercel the first x-forwarded-for entry is the
 * real client; anywhere else it can be spoofed, which only weakens the
 * per-IP half of rate limiting (the per-email half still applies).
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Short stable hash so emails/IPs are not stored in the clear in counters. */
export function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Compares secrets without leaking, via timing, how many characters matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * CSRF defence for state-changing requests. Browsers always send an Origin
 * header on cross-site POSTs, so a mismatch means another website is
 * driving the request. A missing Origin (curl, server-to-server) is allowed:
 * those callers can't ride a victim's browser cookies anyway.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export { safeNextPath } from "@/lib/safeNext";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "123456789",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "qwerty12345",
  "iloveyou123",
  "letmein1234",
  "admin12345",
  "welcome1234",
  "bharatmatrix",
  "bharatmatrix1",
]);

/**
 * Returns a human-readable problem with a NEW password, or null if it's
 * acceptable. Applies only to passwords being created or changed; existing
 * accounts with shorter passwords can still sign in.
 *
 * The 72-byte ceiling is real: bcrypt silently ignores everything past 72
 * bytes, so a longer password would give a false sense of strength.
 */
export function passwordProblem(
  password: string,
  opts: { minLength?: number; email?: string } = {},
): string | null {
  const minLength = opts.minLength ?? 10;
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters.`;
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Password must be at most 72 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include both letters and numbers.";
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Pick something less guessable.";
  }
  if (opts.email) {
    const local = opts.email.split("@")[0].toLowerCase();
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      return "Password must not contain your email name.";
    }
  }
  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
