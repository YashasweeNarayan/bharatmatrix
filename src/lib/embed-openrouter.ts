// TEMPORARY provider: OpenRouter + nvidia/nemotron-3.5-embed-1b:free, used
// only while Gemini's free-tier daily embedding quota is exhausted
// (EmbedContentRequestsPerDayPerProjectPerModel-FreeTier, 1000/day — see
// PROGRESS.md's 2026-11-05 log). Not wired in by default — src/lib/
// embeddings.ts is the single switch point that decides which provider
// file every call site actually uses; this file does nothing until that
// one gets pointed here.
//
// Needs OPENROUTER_API_KEY set in Vercel's Environment Variables.

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.warn(
    "[embed-openrouter] OPENROUTER_API_KEY is not set — embeddings will " +
      "fail until it's added in Vercel's Environment Variables.",
  );
}

const MODEL = "nvidia/nemotron-3.5-embed-1b:free";

// Nemotron's native output is 2048-dim, but the rest of this app (the
// pgvector column, every cosine-search query) is built around Gemini's
// 768-dim vectors. Nemotron's embeddings are Matryoshka-style — OpenRouter's
// own model page says the 2048-dim vector "can be truncated" — so instead
// of altering the database schema, every vector from this provider is
// sliced down to the first 768 values before being stored or compared.
// This keeps the schema identical regardless of which provider is active,
// which is the whole point of this being a quick, reversible swap.
export const EMBEDDING_DIMENSIONS = 768;

// OpenRouter's docs confirm batch input (an array of texts in one request)
// is supported, unlike the Gemini SDK's broken version of the same idea —
// this is the real lever against the free tier's 50/day (unpaid) or
// 1000/day (with $10 credit) request cap. No documented max batch size,
// so this stays conservative rather than guessing an aggressive ceiling.
const EMBED_BATCH_SIZE = 40;
const EMBED_BATCH_MAX_CHARS = 100_000;

type OpenRouterEmbeddingResponse = {
  data?: { embedding: number[]; index: number }[];
  error?: { message?: string; code?: number };
};

// The free nvidia/nemotron-3.5-embed-1b:free backend has no SLA and
// occasionally returns its own 5xx while OpenRouter's gateway wraps it as a
// 502/503, e.g. `502: HTTP 500: {"message":"service inference failed"}` —
// a transient inference-server fault, not something wrong with the request.
// A couple of quick retries clears most of these without blowing Vercel's
// ~10s function-duration cap (embed-step only ever makes one callOpenRouter
// call per invocation, so this budget is safe).
const TRANSIENT_RETRY_DELAYS_MS = [400, 1000];

function isTransientStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

async function callOpenRouter(input: string[]): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input,
        encoding_format: "float",
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | OpenRouterEmbeddingResponse
      | null;

    if (!res.ok || !json?.data) {
      const message =
        json?.error?.message ||
        `OpenRouter embeddings request failed (${res.status}).`;
      lastError = new Error(`${res.status}: ${message}`);

      if (isTransientStatus(res.status) && attempt < TRANSIENT_RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, TRANSIENT_RETRY_DELAYS_MS[attempt]));
        continue;
      }
      throw lastError;
    }

    if (json.data.length !== input.length) {
      throw new Error(
        `OpenRouter returned ${json.data.length} vectors for ${input.length} ` +
          `texts — response shape didn't match the request.`,
      );
    }

    // Index-matched per the standard OpenAI-compatible embeddings shape, but
    // sorted defensively by index rather than assuming array order — that's
    // the one ordering guarantee actually documented.
    return [...json.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding.slice(0, EMBEDDING_DIMENSIONS));
  }

  // Unreachable, but keeps TS happy without a non-null assertion.
  throw lastError ?? new Error("OpenRouter embeddings request failed.");
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const text of texts) {
    const wouldOverflow =
      current.length >= EMBED_BATCH_SIZE ||
      (current.length > 0 && currentChars + text.length > EMBED_BATCH_MAX_CHARS);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) batches.push(current);

  const results: number[][] = [];
  for (const batch of batches) {
    results.push(...(await callOpenRouter(batch)));
  }
  return results;
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/**
 * True if an error is transient and shouldn't mark the document 'failed' —
 * either OpenRouter's rate limit, or a 5xx from the free Nemotron backend
 * that survived the retries in callOpenRouter (it has no SLA and
 * occasionally fails inference outright, e.g.
 * `502: HTTP 500: {"message":"service inference failed"}`). Both cases get
 * the same treatment in embed-step/route.ts: leave the document as
 * 'embedding' and let the client's existing backoff loop in Workspace.tsx
 * retry, rather than treating a flaky free-tier backend as a hard failure.
 */
export function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.startsWith("429:") ||
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("rate-limited") ||
    /^(500|502|503|504):/.test(message) ||
    message.toLowerCase().includes("inference failed") ||
    message.toLowerCase().includes("server_error")
  );
}

/**
 * Gemini's daily cap has a distinct "per day" phrase in its error text
 * that the UI uses to show a clear "resets in ~24h" message instead of
 * retrying pointlessly. OpenRouter's errors don't document an equivalent
 * marker to distinguish a daily cap from a per-minute one, so this always
 * returns false — a sustained 429 here just falls back to the generic
 * "stuck behind rate limit" retry/give-up behavior already in
 * Workspace.tsx, without the daily-specific messaging.
 */
export function isDailyQuotaError(_err: unknown): boolean {
  return false;
}
