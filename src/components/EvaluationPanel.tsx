"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { EvalCase, citationsOf } from "@/lib/types";

export default function EvaluationPanel({ onClose }: { onClose: () => void }) {
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const draining = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/eval", { cache: "no-store" });
    if (!res.ok) {
      setErrorMsg(`Couldn't load the eval set (${res.status}).`);
      return;
    }
    const json = await res.json();
    setCases(json.cases);
    return json.cases as EvalCase[];
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      let attemptsAfterRateLimit = 0;
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/eval/step", { method: "POST" });
        if (res.status === 429) {
          const body = await res.json().catch(() => null);
          if (body?.dailyLimit) {
            setErrorMsg(
              "Hit Gemini's free-tier daily limit mid-run — it resets in " +
                "roughly 24h. Already-graded questions are kept; just run " +
                "again later to finish the rest.",
            );
            break;
          }
          attemptsAfterRateLimit++;
          if (attemptsAfterRateLimit > 8) {
            setErrorMsg(
              "Stuck behind a rate limit for longer than expected — try " +
                "running again in a minute.",
            );
            break;
          }
          await new Promise((r) =>
            setTimeout(r, Math.min(1500 * attemptsAfterRateLimit, 8000)),
          );
          continue;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setErrorMsg(body?.detail || body?.error || `Eval step failed (${res.status}).`);
          break;
        }
        attemptsAfterRateLimit = 0;
        const json = await res.json();
        await refresh();
        if (json.done) break;
      }
    } catch {
      setErrorMsg("Lost connection while running the evaluation — try again.");
    } finally {
      draining.current = false;
    }
  }, [refresh]);

  // Auto-resume any run already in progress (e.g. after a page reload).
  useEffect(() => {
    const hasActive = cases?.some(
      (c) => c.status === "pending" || c.status === "computing",
    );
    if (hasActive) drain();
  }, [cases, drain]);

  async function seed() {
    setErrorMsg(null);
    setSeeding(true);
    try {
      const res = await fetch("/api/eval/seed", { method: "POST" });
      if (!res.ok) {
        setErrorMsg(`Couldn't load the sample eval set (${res.status}).`);
        return;
      }
      await refresh();
    } catch {
      setErrorMsg("Lost connection while loading the sample eval set.");
    } finally {
      setSeeding(false);
    }
  }

  async function reset() {
    setErrorMsg(null);
    setResetting(true);
    try {
      const res = await fetch("/api/eval/reset", { method: "POST" });
      if (!res.ok) {
        setErrorMsg(`Couldn't reset the eval run (${res.status}).`);
        return;
      }
      await refresh();
    } catch {
      setErrorMsg("Lost connection while resetting.");
    } finally {
      setResetting(false);
    }
  }

  const done = cases?.filter((c) => c.status === "done") ?? [];
  const correct = done.filter((c) => c.verdict === "correct").length;
  const partial = done.filter((c) => c.verdict === "partial").length;
  const incorrect = done.filter((c) => c.verdict === "incorrect").length;
  const groundedCount = done.filter((c) => c.grounded).length;
  const anyActive = cases?.some(
    (c) => c.status === "pending" || c.status === "computing",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <div className="w-full max-w-5xl rounded-xl border border-ink-700 bg-ink-950 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-xl border-b border-ink-800 bg-ink-950/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-100">
              Evaluation
            </h2>
            <p className="text-[12px] text-neutral-500">
              Ground-truth Q&amp;A, run through the same ask pipeline the UI
              uses, then graded against the expected answer.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 text-neutral-500 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {errorMsg && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
              <span>{errorMsg}</span>
              <button
                onClick={() => setErrorMsg(null)}
                aria-label="Dismiss error"
                className="flex-shrink-0 text-red-400 hover:text-red-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-neutral-500">Loading…</p>
          ) : !cases || cases.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[13px] text-neutral-400">
                No eval cases yet. Load the sample finance eval set (10
                question/expected-answer pairs matching the synthetic test
                PDFs) to get started.
              </p>
              <button
                onClick={seed}
                disabled={seeding}
                className={clsx(
                  "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
                  seeding
                    ? "cursor-not-allowed bg-ink-800 text-neutral-600"
                    : "bg-saffron-500 text-ink-950 hover:bg-saffron-400",
                )}
              >
                {seeding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load sample eval set
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={drain}
                  disabled={anyActive}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
                    anyActive
                      ? "cursor-not-allowed bg-ink-800 text-neutral-600"
                      : "bg-saffron-500 text-ink-950 hover:bg-saffron-400",
                  )}
                >
                  {anyActive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {anyActive ? "Running…" : "Run all"}
                </button>
                <button
                  onClick={reset}
                  disabled={resetting || anyActive}
                  className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2.5 text-[13px] text-neutral-300 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Reset
                </button>
                {done.length > 0 && (
                  <span className="text-[12px] text-neutral-500">
                    {done.length}/{cases.length} graded &middot;{" "}
                    <span className="text-green-400">{correct} correct</span>,{" "}
                    <span className="text-amber-400">{partial} partial</span>,{" "}
                    <span className="text-red-400">{incorrect} incorrect</span>{" "}
                    &middot; {groundedCount}/{done.length} grounded
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {cases.map((c, i) => (
                  <EvalRow key={c.id} index={i + 1} evalCase={c} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: EvalCase["verdict"] }) {
  if (verdict === "correct") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-400">
        <CheckCircle2 className="h-3 w-3" /> Correct
      </span>
    );
  }
  if (verdict === "partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
        Partial
      </span>
    );
  }
  if (verdict === "incorrect") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-400">
        <XCircle className="h-3 w-3" /> Incorrect
      </span>
    );
  }
  return null;
}

function EvalRow({ index, evalCase: c }: { index: number; evalCase: EvalCase }) {
  const citations = citationsOf(c);

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/40 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-neutral-200">
          {index}. {c.question}
        </p>
        <div className="flex flex-shrink-0 items-center gap-2">
          {c.status === "pending" || c.status === "computing" ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-saffron-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              {c.status === "pending" ? "queued…" : "running…"}
            </span>
          ) : c.status === "failed" ? (
            <span className="text-[12px] text-red-400">failed</span>
          ) : (
            <VerdictBadge verdict={c.verdict} />
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
            Expected
          </p>
          <p className="text-[12.5px] leading-relaxed text-neutral-400">
            {c.expected_answer}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-600">
            Actual {c.status === "done" && (c.grounded ? "(grounded)" : "(ungrounded)")}
          </p>
          <p className="text-[12.5px] leading-relaxed text-neutral-300">
            {c.status === "done"
              ? c.actual_answer
              : c.status === "failed"
                ? c.error || "Failed."
                : "—"}
          </p>
        </div>
      </div>

      {c.status === "done" && c.judge_explanation && (
        <p className="mt-2 text-[12px] italic text-neutral-500">
          {c.judge_explanation}
        </p>
      )}

      {citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {citations.map((cit, i) => (
            <span
              key={i}
              className="rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-[10.5px] text-neutral-500"
            >
              {cit.pageLabel}: &ldquo;{cit.quote.slice(0, 60)}
              {cit.quote.length > 60 ? "…" : ""}&rdquo;
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
