import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCell } from "@/lib/matrix";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Retries a single failed cell — used by the "retry" click in the UI. */
export async function POST(req: NextRequest) {
  await ensureSchema();

  const body = await req.json().catch(() => null);
  const documentId =
    typeof body?.documentId === "string" ? body.documentId : "";
  const questionId =
    typeof body?.questionId === "string" ? body.questionId : "";

  if (!documentId || !questionId) {
    return NextResponse.json(
      { error: "documentId and questionId are required." },
      { status: 400 },
    );
  }

  const [question] = await sql`
    select text from questions where id = ${questionId}
  `;
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  await computeCell(documentId, questionId, question.text as string);

  return NextResponse.json({ ok: true });
}
