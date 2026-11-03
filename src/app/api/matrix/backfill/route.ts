import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCells } from "@/lib/matrix";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fills in cells missing for the current (ready document × question) grid —
 * e.g. a document uploaded after some questions already existed. Explicitly
 * user-triggered (a button in the UI), not run automatically on a timer:
 * each missing cell costs a real Gemini call, and the free tier's daily
 * quota is tight enough that we don't want anything firing calls on a poll.
 */
export async function POST() {
  await ensureSchema();

  const missing = await sql`
    select d.id as document_id, q.id as question_id, q.text as question_text
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

  await computeCells(
    missing.map((m) => ({
      documentId: m.document_id as string,
      questionId: m.question_id as string,
      questionText: m.question_text as string,
    })),
  );

  return NextResponse.json({ filled: missing.length });
}
