import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeContradiction } from "@/lib/contradiction";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Same one-at-a-time pattern as /api/matrix/step, for the same reason. */
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
    select qc.question_id
    from question_contradictions qc
    join questions q on q.id = qc.question_id
    where (qc.status = 'pending'
       or (qc.status = 'computing' and qc.updated_at < now() - interval '2 minutes'))
      and q.user_id = ${user.id}
    order by qc.updated_at asc
    limit 1
  `;

  if (!next) {
    return NextResponse.json({ done: true, remaining: 0 });
  }

  await computeContradiction(next.question_id as string);

  const [{ remaining }] = await sql`
    select count(*)::int as remaining
    from question_contradictions qc
    join questions q on q.id = qc.question_id
    where (qc.status = 'pending'
       or (qc.status = 'computing' and qc.updated_at < now() - interval '2 minutes'))
      and q.user_id = ${user.id}
  `;

  return NextResponse.json({ done: remaining === 0, remaining });
}
