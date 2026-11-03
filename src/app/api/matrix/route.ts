import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

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
    select document_id, question_id, status, answer, grounded, citations, error
    from matrix_cells
  `;

  return NextResponse.json({ documents, questions, cells });
}
