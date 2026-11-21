import { sql } from "@/lib/db";
import { embedText, answerFromContext, judgeAnswer, isRateLimitError } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";
import { hybridRetrieve } from "@/lib/retrieve";

/**
 * Runs one eval question through the exact same pipeline /api/ask uses —
 * embed the question, vector search the top 10 chunks across every ready
 * document, Analyst answer, Verifier check — then grades the verified
 * answer against the question's stored ground-truth expected_answer with
 * a separate judge call. One result per question; re-running overwrites
 * the previous one, same as computeContradiction in contradiction.ts.
 */
export async function computeEval(
  evalQuestionId: string,
  userId: string,
): Promise<void> {
  await sql`
    update eval_results set status = 'computing', updated_at = now()
    where eval_question_id = ${evalQuestionId}
  `;

  try {
    const [evalQuestion] = await sql`
      select question, expected_answer from eval_questions where id = ${evalQuestionId}
    `;
    if (!evalQuestion) throw new Error("Eval question no longer exists.");

    const question = evalQuestion.question as string;
    const expectedAnswer = evalQuestion.expected_answer as string;

    const readyDocs = await sql`
      select id from documents where status = 'ready' and user_id = ${userId}
    `;
    if (readyDocs.length === 0) {
      throw new Error("No documents are ready yet — upload and index some first.");
    }

    const queryEmbedding = await embedText(question);

    // Mirrors /api/ask's retrieval exactly (see lib/retrieve.ts) —
    // hybrid dense+keyword search fused by RRF, then reranked.
    const { chunks: context } = await hybridRetrieve(
      question,
      queryEmbedding,
      userId,
    );

    if (context.length === 0) {
      await sql`
        update eval_results
        set status = 'done', actual_answer = ${"Nothing indexed yet."},
            grounded = false, citations = '[]', verdict = 'incorrect',
            judge_explanation = 'No indexed chunks were available to search.',
            error = null, updated_at = now()
        where eval_question_id = ${evalQuestionId}
      `;
      return;
    }

    const analystResult = await answerFromContext(question, context);
    const verified = verifyGrounding(analystResult, context);

    const judged = await judgeAnswer(
      question,
      expectedAnswer,
      verified.answer,
      verified.grounded,
    );

    await sql`
      update eval_results
      set status = 'done',
          actual_answer = ${verified.answer},
          grounded = ${verified.grounded},
          citations = ${JSON.stringify(verified.citations)},
          verdict = ${judged.verdict},
          judge_explanation = ${judged.explanation},
          error = null,
          updated_at = now()
      where eval_question_id = ${evalQuestionId}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (isRateLimitError(err)) {
      // Transient: leave status as 'pending' (not 'failed') so the
      // client's drain loop just picks it back up, same as embed-step.
      await sql`
        update eval_results set status = 'pending', error = ${message}, updated_at = now()
        where eval_question_id = ${evalQuestionId}
      `;
      throw err;
    }

    await sql`
      update eval_results set status = 'failed', error = ${message}, updated_at = now()
      where eval_question_id = ${evalQuestionId}
    `;
  }
}
