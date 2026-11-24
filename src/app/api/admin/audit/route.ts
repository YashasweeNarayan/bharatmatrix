import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { adminOrResponse } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;
  const entries = await sql`
    select id, admin_email, action, target, created_at
    from admin_audit order by created_at desc limit 100
  `;
  return NextResponse.json({ entries });
}
