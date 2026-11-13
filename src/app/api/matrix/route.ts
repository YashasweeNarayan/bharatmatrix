import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
// Without this, Next.js can statically cache this GET handler's response
// (it reads no request-specific data, so it qualifies) and keep serving a
// stale snapshot from the first time it ran — which is exactly why newly
// added questions and freshly computed cells weren't showing up.
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

  const documents = await sql`
    select id, filename from documents
    where status = 'ready' and user_id = ${user.id}
    order by created_at asc
  `;
  const questions = await sql`
    select id, text from questions where user_id = ${user.id} order by ordinal asc
  `;
  // matrix_cells/question_contradictions have no user_id of their own —
  // they're scoped by joining back to the documents/questions that do,
  // same as every other query in this route.
  const cells = await sql`
    select mc.document_id, mc.question_id, mc.status, mc.answer, mc.grounded,
           mc.citations, mc.verification_note, mc.error
    from matrix_cells mc
    join documents d on d.id = mc.document_id
    where d.user_id = ${user.id}
  `;
  const contradictions = await sql`
    select qc.question_id, qc.status, qc.has_contradiction, qc.explanation, qc.error
    from question_contradictions qc
    join questions q on q.id = qc.question_id
    where q.user_id = ${user.id}
  `;

  return NextResponse.json({ documents, questions, cells, contradictions });
}
