import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { computeCell } from "@/lib/matrix";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Retries a single failed cell — used by the "retry" click in the UI. */
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

  // documentId/questionId come straight from the client, so confirm both
  // actually belong to the caller before touching them — otherwise
  // someone could pass another user's IDs and force a recompute against
  // data that isn't theirs.
  const [question] = await sql`
    select text from questions where id = ${questionId} and user_id = ${user.id}
  `;
  if (!question) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }
  const [document] = await sql`
    select id from documents where id = ${documentId} and user_id = ${user.id}
  `;
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await computeCell(documentId, questionId, question.text as string);

  return NextResponse.json({ ok: true });
}
