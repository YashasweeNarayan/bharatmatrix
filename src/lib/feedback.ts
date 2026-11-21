import { sql } from "@/lib/db";
import type { RetrievedChunk } from "@/lib/retrieve";
import type { VerifiedAnswer } from "@/lib/verify";

/**
 * Logs weak/implicit training signal for the cross-encoder's eventual
 * fine-tuning loop — see the comment on the rerank_feedback table in
 * db.ts for the full reasoning. Short version: only grounded answers
 * produce any signal (cited chunk = positive, other retrieved-but-not-
 * cited chunks = negative hard examples); a not-grounded answer logs
 * nothing, since there's no confirmed label to assign either way.
 *
 * Deliberately fire-and-forget: a logging failure must never affect the
 * actual answer a user gets back, so every caller does
 * `logRerankFeedback(...).catch(...)` rather than awaiting it inline.
 */
export async function logRerankFeedback(
  userId: string | null,
  question: string,
  context: RetrievedChunk[],
  verified: VerifiedAnswer,
): Promise<void> {
  if (!verified.grounded || verified.citations.length === 0) return;

  const citedKeys = new Set(
    verified.citations.map((c) => `${c.documentId}::${c.pageLabel}`),
  );

  const rows = context.map((chunk) => ({
    documentId: chunk.documentId,
    passage: chunk.content,
    label: citedKeys.has(`${chunk.documentId}::${chunk.pageLabel}`) ? 1 : 0,
  }));

  // Cap how many negatives ride along with each question — with
  // FINAL_CONTEXT_SIZE=20 in retrieve.ts, a single grounded answer
  // could otherwise log ~19 negatives for every 1 positive, skewing
  // the eventual training set far more than a reranker needs.
  const positives = rows.filter((r) => r.label === 1);
  const negatives = rows.filter((r) => r.label === 0).slice(0, 5);
  const toInsert = [...positives, ...negatives];

  if (toInsert.length === 0) return;

  await sql`
    insert into rerank_feedback (user_id, document_id, question, passage, label)
    select * from json_to_recordset(${JSON.stringify(
      toInsert.map((r) => ({
        user_id: userId,
        document_id: r.documentId,
        question,
        passage: r.passage,
        label: r.label,
      })),
    )}::json) as t(
      user_id uuid, document_id uuid, question text, passage text, label smallint
    )
  `;
}
