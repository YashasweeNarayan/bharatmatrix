import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  await sql`delete from questions where id = ${params.id}`;
  return NextResponse.json({ ok: true });
}
