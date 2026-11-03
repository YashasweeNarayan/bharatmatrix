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
 * Gemini's free tier returns 503 "high demand" fairly often. Retries with
 * exponential backoff + jitter before giving up, so a transient spike
 * doesn't surface as a user-facing error.
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

      if (!isOverloaded || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = 1000 * 2 ** (attempt - 1) + Math.random() * 300;
      console.warn(
        `[gemini] ${label} overloaded (attempt ${attempt}/${maxAttempts}), ` +
          `retrying in ${Math.round(delayMs)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastErr;
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
 * certainty — fine at this project's scale).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = new Array(texts.length);
  const concurrency = 5;
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
