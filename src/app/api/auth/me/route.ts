import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const user = await getSessionUser(req);
  return NextResponse.json({ user });
}
