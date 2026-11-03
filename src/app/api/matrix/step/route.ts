import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCell } from "@/lib/matrix";

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
 */
export async function POST() {
  await ensureSchema();

  const [next] = await sql`
    select mc.document_id, mc.question_id, q.text as question_text
    from matrix_cells mc
    join questions q on q.id = mc.question_id
    where mc.status = 'pending'
       or (mc.status = 'computing' and mc.updated_at < now() - interval '2 minutes')
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
    from matrix_cells
    where status = 'pending'
       or (status = 'computing' and updated_at < now() - interval '2 minutes')
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
