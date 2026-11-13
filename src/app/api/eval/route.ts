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
