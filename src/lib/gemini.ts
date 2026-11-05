import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "[gemini] GEMINI_API_KEY is not set — embeddings and Q&A will fail " +
      "until it's added in Vercel's Environment Variables.",
  );
}

const client = new GoogleGenAI({ apiKey });

/**
 * Pulls Gemini's own suggested wait out of a 429 error's retryDelay field
 * (and the "Please retry in Xms"/"Xs" phrase in the message as a
 * fallback). NOT trusted blindly: under a sustained per-minute burst,
 * Gemini has been observed suggesting "0s" or a few hundred ms — a delay
 * that short just re-hits the same still-full bucket instantly. Treated as
 * a floor, combined with our own backoff, never used alone.
 */
function extractRetryDelayMs(message: string): number {
  const fieldMatch = message.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  const phraseMatch = message.match(/retry in ([\d.]+)(ms|s)\b/i);
  const fromField = fieldMatch ? parseFloat(fieldMatch[1]) * 1000 : 0;
  const fromPhrase = phraseMatch
    ? parseFloat(phraseMatch[1]) * (phraseMatch[2] === "s" ? 1000 : 1)
    : 0;
  return Math.max(fromField, fromPhrase);
}

/**
 * Gemini's free tier returns 503 "high demand" fairly often, and a burst of
 * calls (e.g. uploading a large PDF — a hundred-plus embedding calls) can
 * trip its per-minute 429 rate limit too. Retries both, but a 429 is not
 * treated as "wait a moment": a per-minute bucket that's already full
 * needs real time to drain, so this uses a 2s-doubling backoff floor
 * (2s, 4s, 8s) regardless of what Gemini's own suggested delay says,
 * taking the larger of the two. Deliberately only 4 attempts (not more) —
 * this runs inside a time-limited request, so it's meant to fail fast and
 * let the caller's own retry queue (embed-step) pace the next attempt,
 * rather than block the whole request trying to outlast the limit itself.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      const isOverloaded =
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("high demand");
      const isRateLimited =
        message.includes("429") ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("Quota exceeded");

      if ((!isOverloaded && !isRateLimited) || attempt === maxAttempts) {
        throw err;
      }

      const backoffFloor = 2000 * 2 ** (attempt - 1) + Math.random() * 300;
      const delayMs = isRateLimited
        ? Math.max(extractRetryDelayMs(message), backoffFloor)
        : backoffFloor;
      console.warn(
        `[gemini] ${label} ${isRateLimited ? "rate-limited" : "overloaded"} ` +
          `(attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delayMs)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastErr;
}

/** True if an error is Gemini's transient per-minute rate limit, not a real failure. */
export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota exceeded")
  );
}

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;
// gemini-3.8-flash is the newest flagship model, capped at just 20
// requests/day on the free tier — unworkable for active development.
// Lite models generally get a more generous free-tier daily quota.
export const CHAT_MODEL = "gemini-3.5-flash-lite";

/**
 * Embeds each text with its own request, at limited concurrency (the SDK's
 * batch endpoint shape wasn't confirmed, so this trades a little speed for
 * certainty — fine at this project's scale). Kept modest (not higher) so a
 * single large document's chunks don't alone burst past the free tier's
 * 100-requests/minute embedding cap — withRetry above is the real backstop,
 * this just makes tripping it less likely in the first place.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < texts.length) {
      const i = cursor++;
      const response = await withRetry<
        Awaited<ReturnType<typeof client.models.embedContent>>
      >(
        () =>
          client.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: texts[i],
            config: { outputDimensionality: EMBEDDING_DIMENSIONS },
          }),
        "embedContent",
      );
      const values = response.embeddings?.[0]?.values;
      if (!values) {
        throw new Error(`Embedding request returned no vector for chunk ${i}.`);
      }
      results[i] = values;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, worker),
  );
  return results;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

export type AnswerCitation = {
  documentId: string;
  pageLabel: string;
  quote: string;
};

export type AnswerResult = {
  answer: string;
  grounded: boolean;
  citations: AnswerCitation[];
};

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description:
        "A direct answer to the question, written only from the provided " +
        "context passages. If the passages don't contain the answer, say " +
        "so plainly instead of guessing.",
    },
    grounded: {
      type: "boolean",
      description:
        "true only if the answer is actually supported by the provided " +
        "passages; false if no supported answer was found.",
    },
    citations: {
      type: "array",
      description:
        "The exact passages that support the answer. Empty if grounded " +
        "is false.",
      items: {
        type: "object",
        properties: {
          documentId: { type: "string" },
          pageLabel: { type: "string" },
          quote: {
            type: "string",
            description:
              "A short exact quote copied from that passage, not a " +
              "paraphrase or summary.",
          },
        },
        required: ["documentId", "pageLabel", "quote"],
      },
    },
  },
  required: ["answer", "grounded", "citations"],
};

export type ContextChunk = {
  documentId: string;
  filename: string;
  pageLabel: string;
  content: string;
};

/**
 * The Analyst step: answers a question using only the given context
 * passages, and claims citations for its own answer. `grounded` here is
 * the model's own self-assessment — worth keeping as a hint, but NOT
 * trusted on its own: a model can misquote a passage and still believe
 * it's grounded. See `verifyGrounding` in src/lib/verify.ts for the actual
 * Verifier step, which checks each claimed quote against the real source
 * text before anything is shown to the user.
 */
export async function answerFromContext(
  question: string,
  context: ContextChunk[],
): Promise<AnswerResult> {
  const contextBlock = context
    .map(
      (c, i) =>
        `[${i + 1}] document_id=${c.documentId} file="${c.filename}" page="${c.pageLabel}"\n${c.content}`,
    )
    .join("\n\n---\n\n");

  const systemInstruction =
    "You are the Analyst for BharatMatrix, a document intelligence tool " +
    "for business documents (annual reports, investor decks, audit " +
    "reports). A separate Verifier will check your citations against the " +
    "source text afterwards, so an inaccurate quote will be caught and " +
    "the answer downgraded — but you should still answer questions ONLY " +
    "using the numbered " +
    "context passages you are given — never from general knowledge or " +
    "things you already know about the company. Every claim in your " +
    "answer must be directly supported by at least one passage, quoted " +
    "exactly (not paraphrased) in the citations array. If the passages " +
    "don't contain a real answer to the question, set grounded to false " +
    "and say in `answer` that it wasn't found in the uploaded documents — " +
    "never invent a number, date or fact that isn't literally present in " +
    "the passages.";

  // Deliberately using the older generateContent method, not the newer
  // Interactions API (client.interactions.create): that one has already
  // shipped a breaking schema change once (May 2026) and the docs push a
  // moving target. generateContent has kept the same request/response
  // shape for years and is a much steadier foundation for a project that
  // can't be hand-tested before every deploy.
  const response = await withRetry<
    Awaited<ReturnType<typeof client.models.generateContent>>
  >(
    () =>
      client.models.generateContent({
        model: CHAT_MODEL,
        contents: `Context passages:\n\n${contextBlock}\n\nQuestion: ${question}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: ANSWER_SCHEMA,
        },
      }),
    "generateContent",
  );

  const text = response.text;
  if (!text) {
    throw new Error(
      "Model response had no text output — it may have been blocked or " +
        "returned an unexpected shape.",
    );
  }

  return JSON.parse(text) as AnswerResult;
}

export type ContradictionResult = {
  hasContradiction: boolean;
  explanation: string;
};

const CONTRADICTION_SCHEMA = {
  type: "object",
  properties: {
    hasContradiction: {
      type: "boolean",
      description:
        "true only if the answers genuinely conflict on a factual point " +
        "(a different number, date, name, or yes/no) — NOT true just " +
        "because they're worded differently, phrased at different levels " +
        "of detail, or one is more specific than the other.",
    },
    explanation: {
      type: "string",
      description:
        "If hasContradiction is true, name which documents disagree and " +
        "what the conflicting values are, in one or two sentences. If " +
        "false, say briefly why the answers are actually consistent.",
    },
  },
  required: ["hasContradiction", "explanation"],
};

/**
 * Compares the same question's already-grounded, already-verified answers
 * across several documents and judges whether they genuinely conflict.
 * Deliberately a single call per question (not one call per document
 * pair) to keep this cheap against the free-tier quota. Unlike the
 * Analyst/Verifier pair, this step is inherently a judgment call — two
 * answers can be worded completely differently and still agree, or look
 * similar and still conflict — so it stays an LLM call rather than a
 * deterministic check.
 */
export async function detectContradiction(
  question: string,
  answers: Array<{ filename: string; answer: string }>,
): Promise<ContradictionResult> {
  const answersBlock = answers
    .map((a, i) => `[${i + 1}] ${a.filename}: ${a.answer}`)
    .join("\n");

  const systemInstruction =
    "You are the Contradiction Checker for BharatMatrix. You are given " +
    "one question and that same question's answer from several different " +
    "business documents (annual reports, investor decks, audit reports), " +
    "where every answer has already been confirmed as grounded in its " +
    "own source document. Your only job is to judge whether these " +
    "answers actually conflict with each other on a factual point. Be " +
    "conservative: different companies, different reporting periods, or " +
    "just different phrasing are NOT contradictions — only flag a real " +
    "disagreement about the same fact.";

  const response = await withRetry<
    Awaited<ReturnType<typeof client.models.generateContent>>
  >(
    () =>
      client.models.generateContent({
        model: CHAT_MODEL,
        contents: `Question: ${question}\n\nAnswers:\n${answersBlock}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: CONTRADICTION_SCHEMA,
        },
      }),
    "generateContent (contradiction check)",
  );

  const text = response.text;
  if (!text) {
    throw new Error(
      "Model response had no text output — it may have been blocked or " +
        "returned an unexpected shape.",
    );
  }

  return JSON.parse(text) as ContradictionResult;
}
