import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedText, answerFromContext } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { hybridRetrieve } from "@/lib/retrieve";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return NextResponse.json(
      { error: "No question provided." },
      { status: 400 },
    );
  }

  const readyDocs = await sql`
    select id from documents where status = 'ready' and user_id = ${user.id}
  `;
  if (readyDocs.length === 0) {
    return NextResponse.json(
      {
        error:
          "No documents are ready to search yet — upload one and wait for " +
          "it to show \"ready\".",
      },
      { status: 400 },
    );
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(question);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Couldn't reach the embeddings model.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  // Hybrid retrieval: dense (vector) + keyword (Postgres full-text)
  // search, fused by Reciprocal Rank Fusion, then narrowed by an
  // LLM-based reranker second pass. See lib/retrieve.ts for the full
  // rationale — this replaces the old dense-only, per-document-
  // windowed query that lived directly in this route.
  const { chunks: context, rerankerUsed } = await hybridRetrieve(
    question,
    queryEmbedding,
    user.id,
  );

  if (context.length === 0) {
    return NextResponse.json({
      answer:
        "Nothing indexed yet for the ready documents — they may still be " +
        "processing.",
      grounded: false,
      citations: [],
      rerankerUsed,
    });
  }

  try {
    const analystResult = await answerFromContext(question, context);
    const result = verifyGrounding(analystResult, context);
    return NextResponse.json({ ...result, rerankerUsed });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Couldn't reach the answering model.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
