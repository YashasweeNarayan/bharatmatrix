import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { answerFromContext } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  await ensureSchema();

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
    select id from documents where status = 'ready'
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

  const rows = await sql`
    select dc.document_id, d.filename, dc.page_label, dc.content,
           dc.embedding <=> ${vectorLiteral}::vector as distance
    from document_chunks dc
    join documents d on d.id = dc.document_id
    where d.status = 'ready' and dc.embedding is not null
    order by distance asc
    limit 10
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
