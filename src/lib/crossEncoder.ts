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

// Gradio-hosted variant (CROSS_ENCODER_MODE=gradio): used when the model sits
// on a free Hugging Face Gradio/ZeroGPU Space, which only exposes Gradio's own
// API — a POST that returns an event id, then a GET that streams the result.
// Written from Gradio's documented HTTP protocol; not run against a live Space.
async function rerankViaGradio(
  base: string,
  question: string,
  passages: string[],
  signal: AbortSignal,
): Promise<number[]> {
  const root = base.replace(/\/+$/, "");
  const start = await fetch(`${root}/gradio_api/call/rerank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [question, JSON.stringify(passages)] }),
    signal,
  });
  if (!start.ok) {
    throw new CrossEncoderUnavailableError(`Cross-encoder returned ${start.status}`);
  }
  const { event_id } = (await start.json()) as { event_id?: string };
  if (!event_id) throw new CrossEncoderUnavailableError("No event_id from Gradio.");

  const result = await fetch(`${root}/gradio_api/call/rerank/${event_id}`, { signal });
  if (!result.ok) {
    throw new CrossEncoderUnavailableError(`Cross-encoder returned ${result.status}`);
  }
  const text = await result.text();
  // SSE body: "event: complete\ndata: [\"<json string>\"]\n\n" (or "event: error").
  const m = text.match(/event: complete\s+data: (.*)/);
  if (!m) throw new CrossEncoderUnavailableError("Gradio call did not complete.");
  const arr = JSON.parse(m[1]) as unknown[];
  const parsed = JSON.parse(String(arr[0])) as { rankedIndexes?: number[] };
  if (!Array.isArray(parsed.rankedIndexes)) {
    throw new CrossEncoderUnavailableError("Cross-encoder response missing rankedIndexes.");
  }
  return parsed.rankedIndexes;
}

export async function rerankWithCrossEncoder(
  question: string,
  passages: string[],
  timeoutMs?: number,
): Promise<number[]> {
  const url = process.env.CROSS_ENCODER_URL;
  const gradio = process.env.CROSS_ENCODER_MODE === "gradio";
  // Gradio needs two round trips, so it gets a little more room.
  timeoutMs ??= gradio ? 4000 : DEFAULT_TIMEOUT_MS;
  if (!url) {
    throw new CrossEncoderUnavailableError("CROSS_ENCODER_URL not configured.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (gradio) return await rerankViaGradio(url, question, passages, controller.signal);
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
