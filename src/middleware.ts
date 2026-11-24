import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * Next.js reads the nonce from the request's CSP header and stamps it on
 * its own scripts; the one hand-written inline script (theme, in
 * layout.tsx) reads it from the x-nonce header.
 *
 * It is sent as REPORT-ONLY first: the browser logs violations to the
 * console but blocks nothing, so a missed source can't break the site.
 * Once a few days of normal use show no violations, set
 * CSP_ENFORCE=true in Vercel to switch it to blocking.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind/Next inject style tags; style injection is far lower risk
    // than script injection, so inline styles stay allowed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headerName =
    process.env.CSP_ENFORCE === "true"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set(headerName, csp);
  return res;
}

export const config = {
  // Pages only: skip API routes, static assets and prefetches.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
