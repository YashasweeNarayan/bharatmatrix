import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 10;

/**
 * Fills in cells missing for the current (ready document × question) grid —
 * e.g. a document uploaded after some questions already existed. Explicitly
 * user-triggered (a button in the UI), not run automatically on a timer.
 * Only inserts the missing 'pending' rows and returns fast — it does NOT
 * compute them here (see /api/matrix/step for why: a single request can't
 * safely await a Gemini call per missing cell on Vercel's free plan). The
 * client drains them afterwards one at a time via /api/matrix/step.
 */
export async function POST() {
  await ensureSchema();

  const missing = await sql`
    select d.id as document_id, q.id as question_id
    from documents d
    cross join questions q
    left join matrix_cells mc
      on mc.document_id = d.id and mc.question_id = q.id
    where d.status = 'ready' and mc.id is null
  `;

  if (missing.length === 0) {
    return NextResponse.json({ filled: 0 });
  }

  await sql`
    insert into matrix_cells (document_id, question_id, status)
    select d.id, q.id, 'pending'
    from documents d
    cross join questions q
    left join matrix_cells mc
      on mc.document_id = d.id and mc.question_id = q.id
    where d.status = 'ready' and mc.id is null
    on conflict (document_id, question_id) do nothing
  `;

  return NextResponse.json({ filled: missing.length });
}
