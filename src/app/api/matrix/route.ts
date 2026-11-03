import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
// Without this, Next.js can statically cache this GET handler's response
// (it reads no request-specific data, so it qualifies) and keep serving a
// stale snapshot from the first time it ran — which is exactly why newly
// added questions and freshly computed cells weren't showing up.
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();

  const documents = await sql`
    select id, filename from documents
    where status = 'ready'
    order by created_at asc
  `;
  const questions = await sql`
    select id, text from questions order by ordinal asc
  `;
  const cells = await sql`
    select document_id, question_id, status, answer, grounded, citations,
           verification_note, error
    from matrix_cells
  `;

  return NextResponse.json({ documents, questions, cells });
}
