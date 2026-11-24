/**
 * Only same-site paths may be used as a post-login destination — anything
 * else (https://evil.example, //evil.example, /\evil) would turn the login
 * page into an open redirect. Client-safe (no Node imports).
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/workspace",
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
