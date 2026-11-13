import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requeues every eval case back to 'pending' so "Run All" can be used again. */
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

  const [{ reset }] = await sql`
    with updated as (
      update eval_results er
      set status = 'pending', error = null
      from eval_questions eq
      where eq.id = er.eval_question_id and eq.user_id = ${user.id}
      returning 1
    )
    select count(*)::int as reset from updated
  `;

  return NextResponse.json({ reset });
}
