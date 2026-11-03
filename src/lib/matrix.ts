import { sql } from "@/lib/db";
import { embedText, answerFromContext } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";

/**
 * Computes (or recomputes) one Matrix cell: answers `questionText` using
 * only the chunks of the one document `documentId`, top-6 by similarity,
 * then runs the Analyst's answer through the deterministic Verifier before
 * writing it in — so a cell is only ever marked grounded once its quote
 * has actually been confirmed against the source text, not just because
 * the model said so. Scoped to a single document — this is what makes it
 * a per-document column answer rather than the cross-document search the
 * free-form Ask box does.
 */
export async function computeCell(
  documentId: string,
  questionId: string,
  questionText: string,
  questionEmbedding?: number[],
): Promise<void> {
  await sql`
    update matrix_cells set status = 'computing', updated_at = now()
    where document_id = ${documentId} and question_id = ${questionId}
  `;

  try {
    const [doc] = await sql`
      select filename from documents where id = ${documentId}
    `;
    if (!doc) throw new Error("Document no longer exists.");

    const vector = questionEmbedding ?? (await embedText(questionText));
    const vectorLiteral = JSON.stringify(vector);

    const rows = await sql`
      select page_label, content,
             embedding <=> ${vectorLiteral}::vector as distance
      from document_chunks
      where document_id = ${documentId}
      order by distance asc
      limit 6
    `;

    if (rows.length === 0) {
      await sql`
        update matrix_cells
        set status = 'ready',
            answer = 'Nothing indexed for this document yet.',
            grounded = false,
            citations = '[]'::jsonb,
            verification_note = null,
            error = null,
            updated_at = now()
        where document_id = ${documentId} and question_id = ${questionId}
      `;
      return;
    }

    const context = rows.map((r) => ({
      documentId,
      filename: doc.filename as string,
      pageLabel: r.page_label as string,
      content: r.content as string,
    }));

    const analystResult = await answerFromContext(questionText, context);
    const result = verifyGrounding(analystResult, context);

    await sql`
      update matrix_cells
      set status = 'ready',
          answer = ${result.answer},
          grounded = ${result.grounded},
          citations = ${JSON.stringify(result.citations)}::jsonb,
          verification_note = ${result.verificationNote},
          error = null,
          updated_at = now()
      where document_id = ${documentId} and question_id = ${questionId}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update matrix_cells
      set status = 'failed', error = ${message}, updated_at = now()
      where document_id = ${documentId} and question_id = ${questionId}
    `;
  }
}

/** Runs computeCell over several (document, question) pairs with bounded concurrency. */
export async function computeCells(
  jobs: Array<{ documentId: string; questionId: string; questionText: string; questionEmbedding?: number[] }>,
  concurrency = 3,
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      await computeCell(
        job.documentId,
        job.questionId,
        job.questionText,
        job.questionEmbedding,
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, worker),
  );
}
