"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, LayoutGrid, Check, Cpu } from "lucide-react";
import clsx from "clsx";

type Citation = {
  documentId: string;
  pageLabel: string;
  quote: string;
};

type RerankerUsed = "cross-encoder" | "gemini" | "none";

type AnswerResult = {
  answer: string;
  grounded: boolean;
  citations: Citation[];
  verificationNote?: string | null;
  rerankerUsed?: RerankerUsed;
};

// Mirrors CROSS_ENCODER_URL's timeout in src/lib/crossEncoder.ts
// (DEFAULT_TIMEOUT_MS). This is a client-side approximation of server
// timing, not a live progress signal — there's no streaming connection
// telling this component when the server actually gives up on the
// cross-encoder and falls back to Gemini. It just switches its own
// wording at roughly the same point the server does, so "waiting" and
// "switching to fallback" track reality closely without needing to
// build real-time status updates for a single request/response call.
const CROSS_ENCODER_TIMEOUT_MS = 2500;

type FilenameLookup = Record<string, string>;

export default function AskPanel({
  readyCount,
  filenameById,
}: {
  readyCount: number;
  filenameById: FilenameLookup;
}) {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movingToMatrix, setMovingToMatrix] = useState(false);
  const [movedToMatrix, setMovedToMatrix] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [waitStage, setWaitStage] = useState<"waiting" | "fallback">("waiting");
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disabled = readyCount === 0 || loading;

  useEffect(() => {
    return () => {
      if (waitTimer.current) clearTimeout(waitTimer.current);
    };
  }, []);

  async function ask() {
    if (!question.trim() || disabled) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setMovedToMatrix(false);
    setMoveError(null);
    setWaitStage("waiting");
    waitTimer.current = setTimeout(
      () => setWaitStage("fallback"),
      CROSS_ENCODER_TIMEOUT_MS,
    );
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
        setAskedQuestion(question);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      if (waitTimer.current) clearTimeout(waitTimer.current);
      setLoading(false);
    }
  }

  // This is purely opt-in: answering a question here never adds it to
  // the Matrix on its own. Only clicking this button does — it just
  // calls the same /api/questions POST the Matrix page's own "add
  // question" input uses, so the question gets a column computed
  // against every ready document, same as if typed there directly.
  async function moveToMatrix() {
    if (!askedQuestion.trim() || movingToMatrix) return;
    setMovingToMatrix(true);
    setMoveError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: askedQuestion }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMoveError(data.error ?? "Couldn't add this to the Matrix.");
      } else {
        setMovedToMatrix(true);
      }
    } catch {
      setMoveError("Couldn't reach the server.");
    } finally {
      setMovingToMatrix(false);
    }
  }

  return (
    <div>
      <h2 className="text-[15px] font-semibold text-neutral-100">
        Ask a question
      </h2>
      <p className="mt-1 text-[13px] text-neutral-500">
        Answered only from what&apos;s actually in your uploaded documents —
        with the exact passage it came from.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          disabled={disabled}
          rows={2}
          placeholder={
            readyCount === 0
              ? "Upload a document first…"
              : "e.g. What was the revenue in 2025?"
          }
          className="w-full resize-none rounded-lg border border-ink-700 bg-ink-900/60 px-3.5 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-saffron-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={ask}
            disabled={disabled || !question.trim()}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
              disabled || !question.trim()
                ? "cursor-not-allowed bg-ink-800 text-neutral-600"
                : "bg-saffron-500 text-ink-950 hover:bg-saffron-400",
            )}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            Ask
          </button>

          {result && (
            <button
              onClick={moveToMatrix}
              disabled={movingToMatrix || movedToMatrix}
              title="Add this question as a column computed against every document in the Matrix"
              className={clsx(
                "flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-[13px] font-medium transition-colors",
                movedToMatrix
                  ? "cursor-default border-matrix-500/30 bg-matrix-500/10 text-matrix-400"
                  : movingToMatrix
                    ? "cursor-not-allowed border-ink-700 bg-ink-800 text-neutral-600"
                    : "border-ink-700 bg-ink-900/60 text-neutral-300 hover:border-saffron-500 hover:text-saffron-400",
              )}
            >
              {movingToMatrix ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : movedToMatrix ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <LayoutGrid className="h-3.5 w-3.5" />
              )}
              {movedToMatrix ? "Added to Matrix" : "Move to Matrix"}
            </button>
          )}
        </div>

        {loading && (
          <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            {waitStage === "waiting"
              ? "Trying your cross-encoder reranker…"
              : "Not responding in time — switching to the Gemini reranker…"}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-4 text-[13px] text-red-400">{error}</p>
      )}

      {moveError && (
        <p className="mt-2 text-[13px] text-red-400">{moveError}</p>
      )}

      {result && (
        <div className="mt-6 rounded-lg border border-ink-700 bg-ink-900/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] leading-relaxed text-neutral-200">
              {result.answer}
            </p>
            <span
              className={clsx(
                "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                result.grounded
                  ? "bg-matrix-500/10 text-matrix-400"
                  : "bg-red-500/10 text-red-400",
              )}
            >
              {result.grounded ? "grounded" : "not found"}
            </span>
          </div>

          {result.rerankerUsed && result.rerankerUsed !== "none" && (
            <p
              className="mt-2 flex items-center gap-1 text-[11px] text-neutral-600"
              title={
                result.rerankerUsed === "cross-encoder"
                  ? "Your self-hosted cross-encoder responded in time and ranked these results."
                  : "The cross-encoder didn't respond in time (or isn't configured yet), so the Gemini reranker handled this one instead."
              }
            >
              <Cpu className="h-3 w-3" />
              {result.rerankerUsed === "cross-encoder"
                ? "Ranked by your cross-encoder"
                : "Ranked by fallback (Gemini reranker)"}
            </p>
          )}

          {result.verificationNote && (
            <p className="mt-2 text-[12px] text-saffron-400/80">
              Verifier: {result.verificationNote}
            </p>
          )}

          {result.citations.length > 0 && (
            <div className="mt-4 flex flex-col gap-2 border-t border-ink-700 pt-3">
              {result.citations.map((c, i) => (
                <div key={i} className="text-[12px]">
                  <p className="font-mono text-matrix-500/80">
                    [{filenameById[c.documentId] ?? "document"} — {c.pageLabel}]
                  </p>
                  <p className="mt-0.5 italic text-neutral-400">
                    &ldquo;{c.quote}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
