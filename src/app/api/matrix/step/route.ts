import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCell } from "@/lib/matrix";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Computes exactly ONE pending cell per call and returns. The client drives
 * this in a loop (after an explicit Add question / Backfill click) rather
 * than one request computing every cell, because a single serverless
 * request on Vercel's free plan is capped at ~10s regardless of the
 * `maxDuration` in code — awaiting several Gemini calls (each with its own
 * retry/backoff) in one request reliably blew past that and got killed
 * mid-flight, which is why new columns looked like they were never
 * created: the question row was inserted, but the request that was
 * supposed to compute and then respond never came back, so the UI never
 * refreshed.
 *
 * Also recovers cells stuck in 'computing' from a previous request that
 * got killed this way, by treating them as eligible again after 2 minutes.
 *
 * Scoped to the signed-in caller: only picks up cells on that user's own
 * documents/questions, so one person's drain loop never computes (or
 * burns Gemini quota on) another user's matrix.
 */
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
    select mc.document_id, mc.question_id, q.text as question_text
    from matrix_cells mc
    join questions q on q.id = mc.question_id
    where (mc.status = 'pending'
       or (mc.status = 'computing' and mc.updated_at < now() - interval '2 minutes'))
      and q.user_id = ${user.id}
    order by mc.updated_at asc
    limit 1
  `;

  if (!next) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  await computeCell(
    next.document_id as string,
    next.question_id as string,
    next.question_text as string,
  );

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from matrix_cells mc
    join questions q on q.id = mc.question_id
    where (mc.status = 'pending'
       or (mc.status = 'computing' and mc.updated_at < now() - interval '2 minutes'))
      and q.user_id = ${user.id}
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
