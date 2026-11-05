import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeContradiction } from "@/lib/contradiction";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Same one-at-a-time pattern as /api/matrix/step, for the same reason. */
export async function POST() {
  await ensureSchema();

  const [next] = await sql`
    select question_id
    from question_contradictions
    where status = 'pending'
       or (status = 'computing' and updated_at < now() - interval '2 minutes')
    order by updated_at asc
    limit 1
  `;

  if (!next) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  await computeContradiction(next.question_id as string);

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from question_contradictions
    where status = 'pending'
       or (status = 'computing' and updated_at < now() - interval '2 minutes')
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
