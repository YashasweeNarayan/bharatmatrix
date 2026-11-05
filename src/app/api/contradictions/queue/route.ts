import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

/**
 * Explicitly user-triggered ("Check contradictions" button). Marks every
 * question that currently has 2+ grounded answers across ready documents
 * as pending a (re)check, then returns immediately — same split as
 * /api/questions and /api/matrix/backfill: inserting/updating rows is
 * fast, but actually running the Gemini calls has to happen one at a time
 * via /api/contradictions/step, or a single request risks the same ~10s
 * platform timeout that silently broke "Add column" before.
 */
export async function POST() {
  await ensureSchema();

  const eligible = await sql`
    select mc.question_id
    from matrix_cells mc
    join documents d on d.id = mc.document_id
    where mc.status = 'ready' and mc.grounded = true and d.status = 'ready'
    group by mc.question_id
    having count(*) >= 2
  `;

  if (eligible.length === 0) {
    return NextResponse.json({ queued: 0 });
  }

  for (const row of eligible) {
    await sql`
      insert into question_contradictions (question_id, status)
      values (${row.question_id}, 'pending')
      on conflict (question_id)
      do update set status = 'pending', error = null
    `;
  }

  return NextResponse.json({ queued: eligible.length });
}
