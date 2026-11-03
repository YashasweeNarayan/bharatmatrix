import type { AnswerCitation, AnswerResult, ContextChunk } from "@/lib/gemini";

/**
 * The Verifier step (Step 5). The Analyst (gemini.ts) finds an answer and
 * claims citations for it, but an LLM can misquote a passage while still
 * believing its answer is grounded — self-assessment isn't real
 * verification. This checks each claimed quote against the ACTUAL source
 * text it was supposedly drawn from, deterministically, with no model
 * call involved: cheap, instant, and immune to the free tier's daily
 * quota. Anything that can't be confirmed is dropped before it ever
 * reaches the UI, so "grounded" means "we found this exact text in the
 * document," not "the model said so."
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function citationIsVerified(
  citation: AnswerCitation,
  context: ContextChunk[],
): boolean {
  const quote = normalize(citation.quote || "");
  if (!quote) return false;

  const matchingPassages = context.filter(
    (c) =>
      c.documentId === citation.documentId &&
      c.pageLabel === citation.pageLabel,
  );
  if (matchingPassages.length === 0) return false;

  return matchingPassages.some((c) => normalize(c.content).includes(quote));
}

export type VerifiedAnswer = AnswerResult & {
  /** Why grounded ended up false, when the Analyst thought otherwise. */
  verificationNote: string | null;
};

export function verifyGrounding(
  analyst: AnswerResult,
  context: ContextChunk[],
): VerifiedAnswer {
  const verifiedCitations = analyst.citations.filter((c) =>
    citationIsVerified(c, context),
  );

  if (verifiedCitations.length === 0) {
    return {
      answer: analyst.answer,
      grounded: false,
      citations: [],
      verificationNote:
        analyst.citations.length > 0
          ? "The model's citation(s) could not be matched to the exact " +
            "source text, so this answer was downgraded to not grounded."
          : null,
    };
  }

  const droppedSome = verifiedCitations.length < analyst.citations.length;

  return {
    answer: analyst.answer,
    grounded: true,
    citations: verifiedCitations,
    verificationNote: droppedSome
      ? "One or more of the model's citations didn't match the source " +
        "text and were removed; the remaining citation(s) were confirmed."
      : null,
  };
}
