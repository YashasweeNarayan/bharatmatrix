import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  const rows = await sql`
    select eq.id, eq.question, eq.expected_answer, eq.ordinal,
           er.status, er.actual_answer, er.grounded, er.citations,
           er.verdict, er.judge_explanation, er.error
    from eval_questions eq
    left join eval_results er on er.eval_question_id = eq.id
    where eq.user_id = ${user.id}
    order by eq.ordinal asc
  `;

  return NextResponse.json({ cases: rows });
}

// Lets a user grow their own ground-truth set one case at a time,
// instead of the eval set being limited to the fixed 10-question seed
// in /api/eval/seed. This is the actual durable path for ground truth
// in this app — a row you can add to any time — rather than a one-off
// file import that would need a full re-upload for a single new case.
export async function POST(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  const body = await req.json().catch(() => null);
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";
  const expectedAnswer =
    typeof body?.expectedAnswer === "string" ? body.expectedAnswer.trim() : "";

  if (!question || !expectedAnswer) {
    return NextResponse.json(
      { error: "Both a question and an expected answer are required." },
      { status: 400 },
    );
  }

  const [{ nextOrdinal }] = await sql`
    select coalesce(max(ordinal), -1) + 1 as "nextOrdinal"
    from eval_questions where user_id = ${user.id}
  `;

  const [row] = await sql`
    insert into eval_questions (question, expected_answer, ordinal, user_id)
    values (${question}, ${expectedAnswer}, ${nextOrdinal}, ${user.id})
    returning id
  `;
  await sql`
    insert into eval_results (eval_question_id, status)
    values (${row.id}, 'pending')
  `;

  return NextResponse.json({ id: row.id });
}

export async function DELETE(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  await sql`
    delete from eval_questions where id = ${id} and user_id = ${user.id}
  `;

  return NextResponse.json({ ok: true });
}
