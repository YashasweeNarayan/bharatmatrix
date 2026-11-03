import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedText } from "@/lib/gemini";
import { computeCells } from "@/lib/matrix";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  await ensureSchema();
  const questions = await sql`
    select id, text, ordinal from questions order by ordinal asc
  `;
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "No question text provided." },
      { status: 400 },
    );
  }

  const [{ next_ordinal: nextOrdinal }] = await sql`
    select coalesce(max(ordinal), -1) + 1 as next_ordinal from questions
  `;

  const [question] = await sql`
    insert into questions (text, ordinal) values (${text}, ${nextOrdinal})
    returning id
  `;

  const readyDocs = await sql`
    select id from documents where status = 'ready'
  `;

  if (readyDocs.length > 0) {
    await sql`
      insert into matrix_cells (document_id, question_id, status)
      select id, ${question.id}, 'pending' from documents where status = 'ready'
      on conflict (document_id, question_id) do nothing
    `;
  }

  // Embed the question once and reuse it for every document's search,
  // instead of re-embedding per document.
  let questionEmbedding: number[] | undefined;
  try {
    questionEmbedding = await embedText(text);
  } catch {
    questionEmbedding = undefined; // each cell will embed on its own instead
  }

  await computeCells(
    readyDocs.map((d) => ({
      documentId: d.id as string,
      questionId: question.id as string,
      questionText: text,
      questionEmbedding,
    })),
  );

  return NextResponse.json({ questionId: question.id });
}
