import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeEval } from "@/lib/eval";
import { isRateLimitError, isDailyQuotaError } from "@/lib/gemini";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Same one-at-a-time drain pattern as /api/matrix/step and /api/contradictions/step. */
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

  const [next] = await sql`
    select er.eval_question_id
    from eval_results er
    join eval_questions eq on eq.id = er.eval_question_id
    where (er.status = 'pending'
       or (er.status = 'computing' and er.updated_at < now() - interval '2 minutes'))
      and eq.user_id = ${user.id}
    order by er.updated_at asc
    limit 1
  `;

  if (!next) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  try {
    await computeEval(next.eval_question_id as string, user.id);
  } catch (err) {
    if (isRateLimitError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { done: false, remaining: null, rateLimited: true, dailyLimit: isDailyQuotaError(err), detail: message },
        { status: 429 },
      );
    }
    // Any other error was already recorded onto the row as status='failed'
    // by computeEval itself; fall through and report remaining as usual.
  }

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from eval_results er
    join eval_questions eq on eq.id = er.eval_question_id
    where (er.status = 'pending'
       or (er.status = 'computing' and er.updated_at < now() - interval '2 minutes'))
      and eq.user_id = ${user.id}
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
