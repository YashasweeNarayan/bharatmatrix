"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import clsx from "clsx";

type Citation = {
  documentId: string;
  pageLabel: string;
  quote: string;
};

type AnswerResult = {
  answer: string;
  grounded: boolean;
  citations: Citation[];
  verificationNote?: string | null;
};

type FilenameLookup = Record<string, string>;

export default function AskPanel({
  readyCount,
  filenameById,
}: {
  readyCount: number;
  filenameById: FilenameLookup;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = readyCount === 0 || loading;

  async function ask() {
    if (!question.trim() || disabled) return;
    setLoading(true);
    setError(null);
    setResult(null);
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
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-12 border-t border-ink-700 pt-10">
      <h2 className="text-[15px] font-semibold text-neutral-100">
        Ask a question
      </h2>
      <p className="mt-1 text-[13px] text-neutral-500">
        Answered only from what&apos;s actually in your uploaded documents —
        with the exact passage it came from.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          disabled={disabled}
          placeholder={
            readyCount === 0
              ? "Upload a document first…"
              : "e.g. What was the revenue in 2025?"
          }
          className="flex-1 rounded-lg border border-ink-700 bg-ink-900/60 px-3.5 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-saffron-500"
        />
        <button
          onClick={ask}
          disabled={disabled || !question.trim()}
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
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
      </div>

      {error && (
        <p className="mt-4 text-[13px] text-red-400">{error}</p>
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
