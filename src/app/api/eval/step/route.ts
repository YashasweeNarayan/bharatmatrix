import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeEval } from "@/lib/eval";
import { isRateLimitError, isDailyQuotaError } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Same one-at-a-time drain pattern as /api/matrix/step and /api/contradictions/step. */
export async function POST() {
  await ensureSchema();

  const [next] = await sql`
    select eval_question_id
    from eval_results
    where status = 'pending'
       or (status = 'computing' and updated_at < now() - interval '2 minutes')
    order by updated_at asc
    limit 1
  `;

  if (!next) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  try {
    await computeEval(next.eval_question_id as string);
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
    from eval_results
    where status = 'pending'
       or (status = 'computing' and updated_at < now() - interval '2 minutes')
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
