import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, clearSessionCookie, destroySession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await ensureSchema();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
