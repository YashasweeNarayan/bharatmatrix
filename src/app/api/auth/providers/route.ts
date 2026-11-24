import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/google";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ google: googleConfigured() });
}
