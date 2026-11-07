import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();

  const rows = await sql`
    select eq.id, eq.question, eq.expected_answer, eq.ordinal,
           er.status, er.actual_answer, er.grounded, er.citations,
           er.verdict, er.judge_explanation, er.error
    from eval_questions eq
    left join eval_results er on er.eval_question_id = eq.id
    order by eq.ordinal asc
  `;

  return NextResponse.json({ cases: rows });
}
