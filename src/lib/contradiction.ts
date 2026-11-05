import { sql } from "@/lib/db";
import { detectContradiction } from "@/lib/gemini";

/**
 * Checks one question's grounded answers across every ready document for a
 * genuine factual conflict. Needs at least two documents with a grounded
 * answer to that question to say anything — otherwise there's nothing to
 * compare, and it's marked ready with has_contradiction = false rather
 * than left pending forever.
 */
export async function computeContradiction(questionId: string): Promise<void> {
  await sql`
    update question_contradictions set status = 'computing', updated_at = now()
    where question_id = ${questionId}
  `;

  try {
    const [question] = await sql`
      select text from questions where id = ${questionId}
    `;
    if (!question) throw new Error("Question no longer exists.");

    const rows = await sql`
      select d.filename, mc.answer
      from matrix_cells mc
      join documents d on d.id = mc.document_id
      where mc.question_id = ${questionId}
        and mc.status = 'ready'
        and mc.grounded = true
        and d.status = 'ready'
    `;

    if (rows.length < 2) {
      await sql`
        update question_contradictions
        set status = 'ready', has_contradiction = false, explanation = null,
            error = null, updated_at = now()
        where question_id = ${questionId}
      `;
      return;
    }

    const result = await detectContradiction(
      question.text as string,
      rows.map((r) => ({
        filename: r.filename as string,
        answer: r.answer as string,
      })),
    );

    await sql`
      update question_contradictions
      set status = 'ready',
          has_contradiction = ${result.hasContradiction},
          explanation = ${result.explanation},
          error = null,
          updated_at = now()
      where question_id = ${questionId}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      update question_contradictions
      set status = 'failed', error = ${message}, updated_at = now()
      where question_id = ${questionId}
    `;
  }
}
