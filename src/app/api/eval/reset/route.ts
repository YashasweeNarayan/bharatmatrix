import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requeues every eval case back to 'pending' so "Run All" can be used again. */
export async function POST() {
  await ensureSchema();

  const [{ reset }] = await sql`
    with updated as (
      update eval_results
      set status = 'pending', error = null
      returning 1
    )
    select count(*)::int as reset from updated
  `;

  return NextResponse.json({ reset });
}
