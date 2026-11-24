import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  googleAuthUrl,
  googleConfigured,
} from "@/lib/google";
import { safeNextPath } from "@/lib/security";

export const runtime = "nodejs";

/** Starts Google sign-in. ?mode=admin for the admin flow, ?next=/path. */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/login?error=google_off", req.url));
  }
  const mode = req.nextUrl.searchParams.get("mode") === "admin" ? "admin" : "user";
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const state = randomBytes(24).toString("hex");

  const res = NextResponse.redirect(googleAuthUrl(req, state));
  // The state is bound to this browser by a short-lived httpOnly cookie, so
  // a callback forged from another site (login CSRF) can't complete.
  res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, mode, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
