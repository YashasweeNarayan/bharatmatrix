import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedText, answerFromContext } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";
import { requireUser, UnauthorizedError } from "@/lib/auth";

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

  const vectorLiteral = JSON.stringify(queryEmbedding);

  // A single global "top 10 by distance" search lets whichever document
  // happens to word-match the question most closely crowd out every
  // other document's chunks entirely — exactly the failure mode a
  // question needing evidence from several documents at once (e.g.
  // cross-checking one company's numbers across three of its own
  // filings) runs into: the two chunks that would have answered the
  // other half of the question never make it into context, and the
  // model (correctly) says it can't find them. Partitioning by
  // document_id and taking each document's own top matches first
  // guarantees every ready document gets a fair shot at contributing
  // its most relevant chunk(s) before the overall cap is applied, so a
  // multi-document question doesn't lose evidence to a single
  // dominant document.
  const PER_DOC_LIMIT = 4;
  const TOTAL_LIMIT = 40;
  const rows = await sql`
    with ranked as (
      select dc.document_id, d.filename, dc.page_label, dc.content,
             dc.embedding <=> ${vectorLiteral}::vector as distance,
             row_number() over (
               partition by dc.document_id
               order by dc.embedding <=> ${vectorLiteral}::vector asc
             ) as rank_in_doc
      from document_chunks dc
      join documents d on d.id = dc.document_id
      where d.status = 'ready' and dc.embedding is not null and d.user_id = ${user.id}
    )
    select document_id, filename, page_label, content, distance
    from ranked
    where rank_in_doc <= ${PER_DOC_LIMIT}
    order by distance asc
    limit ${TOTAL_LIMIT}
  `;

  if (rows.length === 0) {
    return NextResponse.json({
      answer:
        "Nothing indexed yet for the ready documents — they may still be " +
        "processing.",
      grounded: false,
      citations: [],
    });
  }

  try {
    const context = rows.map((r) => ({
      documentId: r.document_id as string,
      filename: r.filename as string,
      pageLabel: r.page_label as string,
      content: r.content as string,
    }));
    const analystResult = await answerFromContext(question, context);
    const result = verifyGrounding(analystResult, context);
    return NextResponse.json(result);
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
