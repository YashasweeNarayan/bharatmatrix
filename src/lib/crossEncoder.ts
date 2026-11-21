/**
 * Thin client for an optionally self-hosted cross-encoder reranker
 * (see rerankWithFallback in retrieve.ts for the actual fallback logic).
 * Not wired to anything yet — CROSS_ENCODER_URL is unset until a real
 * trained model is deployed somewhere (HF Spaces / Render / etc.), at
 * which point this is the only file that needs to know its contract.
 *
 * Expected contract: POST { question: string, passages: string[] } ->
 * { rankedIndexes: number[] } — 0-based indexes into `passages`, most to
 * least relevant, same shape the Gemini-based reranker already produces
 * internally, so both paths can share one result-ordering code path in
 * retrieve.ts.
 */
export class CrossEncoderUnavailableError extends Error {}

const DEFAULT_TIMEOUT_MS = 2500;
// This has to stay short and deliberate, not generous: the whole
// /api/ask request already spends time on embedding + two SQL searches
// + (on fallback) the Gemini rerank call + the Analyst + the Verifier,
// all before this function even returns — and this project has already
// hit Vercel's free-plan real request ceiling once (see the comment in
// matrix/step/route.ts). A hosted model's cold start can take 10-30s;
// waiting that long here would blow the whole request's budget just to
// *maybe* get a better rerank. 2.5s is "long enough for an already-warm
// model to answer, short enough that a cold one doesn't sink the request."

export async function rerankWithCrossEncoder(
  question: string,
  passages: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number[]> {
  const url = process.env.CROSS_ENCODER_URL;
  if (!url) {
    throw new CrossEncoderUnavailableError("CROSS_ENCODER_URL not configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, passages }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new CrossEncoderUnavailableError(
        `Cross-encoder returned ${res.status}`,
      );
    }

    const data = (await res.json()) as { rankedIndexes?: number[] };
    if (!Array.isArray(data.rankedIndexes)) {
      throw new CrossEncoderUnavailableError(
        "Cross-encoder response missing rankedIndexes.",
      );
    }
    return data.rankedIndexes;
  } catch (err) {
    if (err instanceof CrossEncoderUnavailableError) throw err;
    // Covers both the AbortController timeout firing (DOMException
    // "AbortError") and any network-level failure (DNS, connection
    // refused, TLS) — all of these mean the same thing to the caller:
    // the hosted model wasn't there in time, fall back.
    throw new CrossEncoderUnavailableError(
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}
