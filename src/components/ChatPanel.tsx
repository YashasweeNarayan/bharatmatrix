"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  ArrowUp,
  LayoutGrid,
  Check,
  Cpu,
  MessageSquare,
} from "lucide-react";
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

// Mirrors CROSS_ENCODER_URL's timeout in src/lib/crossEncoder.ts — a
// client-side approximation of server timing (no streaming connection
// exists to push real progress), same reasoning as before this became
// a multi-turn thread.
const CROSS_ENCODER_TIMEOUT_MS = 2500;

type Turn = {
  id: string;
  question: string;
  status: "loading" | "done" | "error";
  waitStage: "waiting" | "fallback";
  result: AnswerResult | null;
  error: string | null;
  movingToMatrix: boolean;
  movedToMatrix: boolean;
  moveError: string | null;
};

type FilenameLookup = Record<string, string>;

function newId() {
  return Math.random().toString(36).slice(2);
}

/**
 * The center column of the Home dashboard — a running conversation
 * thread, Claude-style: every question asked this session stays visible
 * above the next one, instead of the old single-question/single-answer
 * panel being replaced each time. Each turn still opts into the Matrix
 * individually ("Move to Matrix" per answer) — asking a question here
 * never adds it on its own.
 */
export default function ChatPanel({
  readyCount,
  filenameById,
}: {
  readyCount: number;
  filenameById: FilenameLookup;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const waitTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const disabled = readyCount === 0;

  useEffect(() => {
    const timers = waitTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  function patchTurn(id: string, patch: Partial<Turn>) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function ask() {
    const text = question.trim();
    if (!text || disabled || turns.some((t) => t.status === "loading")) return;

    const id = newId();
    setTurns((prev) => [
      ...prev,
      {
        id,
        question: text,
        status: "loading",
        waitStage: "waiting",
        result: null,
        error: null,
        movingToMatrix: false,
        movedToMatrix: false,
        moveError: null,
      },
    ]);
    setQuestion("");

    const timer = setTimeout(
      () => patchTurn(id, { waitStage: "fallback" }),
      CROSS_ENCODER_TIMEOUT_MS,
    );
    waitTimers.current.set(id, timer);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        patchTurn(id, { status: "error", error: data.error ?? "Something went wrong." });
      } else {
        patchTurn(id, { status: "done", result: data });
      }
    } catch {
      patchTurn(id, { status: "error", error: "Couldn't reach the server." });
    } finally {
      clearTimeout(waitTimers.current.get(id));
      waitTimers.current.delete(id);
    }
  }

  // Same opt-in behavior as before: only this button adds a question to
  // the Matrix, calling the same /api/questions POST the Matrix page's
  // own "add question" input uses.
  async function moveToMatrix(id: string, text: string) {
    patchTurn(id, { movingToMatrix: true, moveError: null });
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const raw = await res.text();
      let data: { error?: string; questionId?: string } | null = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Not JSON — surface the raw status/body instead of guessing.
      }

      if (!res.ok) {
        patchTurn(id, {
          moveError: data?.error ?? `Request failed (${res.status}): ${raw.slice(0, 200)}`,
        });
      } else if (!data) {
        patchTurn(id, {
          moveError: `Unexpected response (${res.status}, not JSON): ${raw.slice(0, 200)}`,
        });
      } else {
        patchTurn(id, { movedToMatrix: true });
      }
    } catch (err) {
      patchTurn(id, {
        moveError: `Couldn't reach the server: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      patchTurn(id, { movingToMatrix: false });
    }
  }

  const anyLoading = turns.some((t) => t.status === "loading");

  return (
    <div className="flex h-full min-h-[70vh] flex-col rounded-2xl border border-ink-700 bg-ink-900/40">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
            <MessageSquare className="h-6 w-6 text-neutral-700" />
            <p className="mt-3 text-[14px] text-neutral-400">
              Ask anything about your documents
            </p>
            <p className="mt-1 max-w-xs text-[13px] text-neutral-600">
              {readyCount === 0
                ? "Upload a document on the right to get started."
                : "Answered only from what's actually in them, with the exact passage cited."}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[640px] flex-col gap-6">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-2.5">
                <div className="self-end rounded-2xl rounded-br-sm bg-ink-800 px-4 py-2.5 text-[13.5px] text-neutral-100">
                  {t.question}
                </div>

                {t.status === "loading" && (
                  <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t.waitStage === "waiting"
                      ? "Trying your cross-encoder reranker…"
                      : "Not responding in time — switching to the Gemini reranker…"}
                  </p>
                )}

                {t.status === "error" && (
                  <p className="text-[13px] text-red-400">{t.error}</p>
                )}

                {t.status === "done" && t.result && (
                  <div className="rounded-2xl rounded-bl-sm border border-ink-700 bg-ink-900/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] leading-relaxed text-neutral-200">
                        {t.result.answer}
                      </p>
                      <span
                        className={clsx(
                          "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                          t.result.grounded
                            ? "bg-matrix-500/10 text-matrix-400"
                            : "bg-red-500/10 text-red-400",
                        )}
                      >
                        {t.result.grounded ? "grounded" : "not found"}
                      </span>
                    </div>

                    {t.result.rerankerUsed && t.result.rerankerUsed !== "none" && (
                      <p
                        className="mt-2 flex items-center gap-1 text-[11px] text-neutral-600"
                        title={
                          t.result.rerankerUsed === "cross-encoder"
                            ? "Your self-hosted cross-encoder responded in time and ranked these results."
                            : "The cross-encoder didn't respond in time (or isn't configured yet), so the Gemini reranker handled this one instead."
                        }
                      >
                        <Cpu className="h-3 w-3" />
                        {t.result.rerankerUsed === "cross-encoder"
                          ? "Ranked by your cross-encoder"
                          : "Ranked by fallback (Gemini reranker)"}
                      </p>
                    )}

                    {t.result.verificationNote && (
                      <p className="mt-2 text-[12px] text-saffron-400/80">
                        Verifier: {t.result.verificationNote}
                      </p>
                    )}

                    {t.result.citations.length > 0 && (
                      <div className="mt-4 flex flex-col gap-2 border-t border-ink-700 pt-3">
                        {t.result.citations.map((c, i) => (
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

                    <div className="mt-3 flex items-center gap-2 border-t border-ink-700 pt-3">
                      <button
                        onClick={() => moveToMatrix(t.id, t.question)}
                        disabled={t.movingToMatrix || t.movedToMatrix}
                        title="Add this question as a column computed against every document in the Matrix"
                        className={clsx(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                          t.movedToMatrix
                            ? "cursor-default border-matrix-500/30 bg-matrix-500/10 text-matrix-400"
                            : t.movingToMatrix
                              ? "cursor-not-allowed border-ink-700 bg-ink-800 text-neutral-600"
                              : "border-ink-700 bg-ink-900/60 text-neutral-300 hover:border-saffron-500 hover:text-saffron-400",
                        )}
                      >
                        {t.movingToMatrix ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : t.movedToMatrix ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <LayoutGrid className="h-3 w-3" />
                        )}
                        {t.movedToMatrix ? "Added to Matrix" : "Move to Matrix"}
                      </button>
                    </div>
                    {t.moveError && (
                      <p className="mt-2 text-[12px] text-red-400">{t.moveError}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-ink-700 p-3">
        <div className="mx-auto flex max-w-[640px] items-end gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 focus-within:border-saffron-500">
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
            rows={1}
            placeholder={
              readyCount === 0
                ? "Upload a document first…"
                : "Ask a question about your documents…"
            }
            className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13.5px] text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
          <button
            onClick={ask}
            disabled={disabled || !question.trim() || anyLoading}
            aria-label="Ask"
            className={clsx(
              "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
              disabled || !question.trim() || anyLoading
                ? "cursor-not-allowed bg-ink-800 text-neutral-600"
                : "bg-saffron-500 text-onaccent hover:bg-saffron-400",
            )}
          >
            {anyLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
