import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn(
    "[gemini] GEMINI_API_KEY is not set — embeddings and Q&A will fail " +
      "until it's added in Vercel's Environment Variables.",
  );
}

const client = new GoogleGenAI({ apiKey });

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;
export const CHAT_MODEL = "gemini-3.8-flash";

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
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: texts[i],
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });
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

type ContextChunk = {
  documentId: string;
  filename: string;
  pageLabel: string;
  content: string;
};

/**
 * Answers a question using only the given context passages. This is the
 * Analyst + Verifier step combined into one call: the schema and system
 * instruction force every claim to carry an exact quote, and `grounded`
 * tells the caller whether to trust the answer at all.
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
    "You are the Analyst and Verifier for BharatMatrix, a document " +
    "intelligence tool for business documents (annual reports, investor " +
    "decks, audit reports). You answer questions ONLY using the numbered " +
    "context passages you are given — never from general knowledge or " +
    "things you already know about the company. Every claim in your " +
    "answer must be directly supported by at least one passage, quoted " +
    "exactly (not paraphrased) in the citations array. If the passages " +
    "don't contain a real answer to the question, set grounded to false " +
    "and say in `answer` that it wasn't found in the uploaded documents — " +
    "never invent a number, date or fact that isn't literally present in " +
    "the passages.";

  const interaction = (await client.interactions.create({
    model: CHAT_MODEL,
    system_instruction: systemInstruction,
    input: `Context passages:\n\n${contextBlock}\n\nQuestion: ${question}`,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: ANSWER_SCHEMA,
    },
  })) as unknown;

  return JSON.parse(extractOutputText(interaction)) as AnswerResult;
}

/**
 * The SDK's published TS types don't yet match the Interactions API docs
 * (a `.d.ts` that lags a very new API), so this reads the response
 * defensively instead of trusting one exact property name/casing.
 */
function extractOutputText(interaction: unknown): string {
  const obj = interaction as Record<string, unknown>;

  if (typeof obj?.output_text === "string") return obj.output_text;
  if (typeof obj?.outputText === "string") return obj.outputText as string;

  if (Array.isArray(obj?.steps)) {
    const text = (obj.steps as Array<Record<string, unknown>>)
      .filter((step) => step?.type === "model_output")
      .flatMap((step) => (Array.isArray(step?.content) ? step.content : []))
      .filter(
        (block): block is { type: string; text: string } =>
          !!block &&
          typeof block === "object" &&
          (block as Record<string, unknown>).type === "text",
      )
      .map((block) => block.text)
      .join("");
    if (text) return text;
  }

  throw new Error(
    "Couldn't find text output on the model response — unexpected response shape: " +
      JSON.stringify(obj).slice(0, 500),
  );
}
