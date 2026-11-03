"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";

type CellStatus = "pending" | "computing" | "ready" | "failed";

type Citation = {
  documentId: string;
  pageLabel: string;
  quote: string;
};

type Cell = {
  document_id: string;
  question_id: string;
  status: CellStatus;
  answer: string | null;
  grounded: boolean | null;
  citations: Citation[] | null;
  error: string | null;
};

type DocumentRow = { id: string; filename: string };
type Question = { id: string; text: string };

type MatrixData = {
  documents: DocumentRow[];
  questions: Question[];
  cells: Cell[];
};

function cellKey(documentId: string, questionId: string) {
  return `${documentId}::${questionId}`;
}

export default function MatrixTable() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [selected, setSelected] = useState<Cell | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/matrix");
    if (!res.ok) return;
    const json = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Cheap DB-only poll while something is actively being computed — no
  // Gemini calls happen just from polling this endpoint.
  useEffect(() => {
    const hasActive = data?.cells.some(
      (c) => c.status === "pending" || c.status === "computing",
    );
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(refresh, 2500);
    }
    if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data, refresh]);

  const cellMap = new Map<string, Cell>();
  data?.cells.forEach((c) => cellMap.set(cellKey(c.document_id, c.question_id), c));

  const missingCount =
    data?.documents.reduce(
      (acc, doc) =>
        acc +
        data.questions.filter((q) => !cellMap.has(cellKey(doc.id, q.id)))
          .length,
      0,
    ) ?? 0;

  async function addQuestion() {
    if (!newQuestion.trim() || addingQuestion) return;
    setAddingQuestion(true);
    try {
      await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newQuestion.trim() }),
      });
      setNewQuestion("");
      await refresh();
    } finally {
      setAddingQuestion(false);
    }
  }

  async function removeQuestion(id: string) {
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function retryCell(documentId: string, questionId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            cells: prev.cells.map((c) =>
              c.document_id === documentId && c.question_id === questionId
                ? { ...c, status: "computing" }
                : c,
            ),
          }
        : prev,
    );
    await fetch("/api/matrix/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, questionId }),
    });
    await refresh();
  }

  async function backfill() {
    setBackfilling(true);
    try {
      await fetch("/api/matrix/backfill", { method: "POST" });
      await refresh();
    } finally {
      setBackfilling(false);
    }
  }

  if (loading) {
    return <p className="text-[13px] text-neutral-500">Loading matrix…</p>;
  }

  if (!data || data.documents.length === 0) {
    return (
      <p className="text-[13px] text-neutral-500">
        No ready documents yet — upload some in the{" "}
        <a href="/workspace" className="text-saffron-400 hover:underline">
          Workspace
        </a>{" "}
        first.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addQuestion();
          }}
          placeholder="Add a question as a new column, e.g. What was the revenue?"
          className="min-w-[280px] flex-1 rounded-lg border border-ink-700 bg-ink-900/60 px-3.5 py-2.5 text-[13px] text-neutral-200 placeholder:text-neutral-600 focus:border-saffron-500"
        />
        <button
          onClick={addQuestion}
          disabled={!newQuestion.trim() || addingQuestion}
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors",
            !newQuestion.trim() || addingQuestion
              ? "cursor-not-allowed bg-ink-800 text-neutral-600"
              : "bg-saffron-500 text-ink-950 hover:bg-saffron-400",
          )}
        >
          {addingQuestion ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add column
        </button>
        {missingCount > 0 && (
          <button
            onClick={backfill}
            disabled={backfilling}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2.5 text-[13px] text-neutral-300 hover:bg-ink-800"
          >
            {backfilling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Fill {missingCount} missing cell{missingCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {data.questions.length === 0 ? (
        <p className="mt-6 text-[13px] text-neutral-500">
          No questions yet — add one above to start filling the matrix.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[180px] border-b border-r border-ink-700 bg-ink-800/60 px-4 py-2.5 text-[12px] font-medium text-neutral-500">
                  Document
                </th>
                {data.questions.map((q) => (
                  <th
                    key={q.id}
                    className="min-w-[220px] border-b border-r border-ink-700 bg-ink-800/60 px-4 py-2.5 text-[12px] font-medium text-neutral-300 last:border-r-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>{q.text}</span>
                      <button
                        onClick={() => removeQuestion(q.id)}
                        aria-label={`Remove question "${q.text}"`}
                        className="flex-shrink-0 rounded p-0.5 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.documents.map((doc) => (
                <tr key={doc.id}>
                  <td
                    className="sticky left-0 z-10 truncate border-b border-r border-ink-700 bg-ink-900 px-4 py-3 font-mono text-[12px] text-neutral-400"
                    title={doc.filename}
                  >
                    {doc.filename}
                  </td>
                  {data.questions.map((q) => {
                    const cell = cellMap.get(cellKey(doc.id, q.id));
                    return (
                      <td
                        key={q.id}
                        className="border-b border-r border-ink-700 px-4 py-3 align-top last:border-r-0"
                      >
                        <MatrixCell
                          cell={cell}
                          onSelect={() => cell && setSelected(cell)}
                          onRetry={() => retryCell(doc.id, q.id)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 border-t border-ink-700 pt-6">
        <h3 className="text-[13px] font-medium text-neutral-300">Evidence</h3>
        {!selected ? (
          <p className="mt-2 text-[13px] text-neutral-600">
            Click a filled cell to see the exact passage it was answered from.
          </p>
        ) : (
          <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] leading-relaxed text-neutral-200">
                {selected.answer}
              </p>
              <span
                className={clsx(
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                  selected.grounded
                    ? "bg-matrix-500/10 text-matrix-400"
                    : "bg-red-500/10 text-red-400",
                )}
              >
                {selected.grounded ? "grounded" : "not found"}
              </span>
            </div>
            {selected.citations && selected.citations.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-ink-700 pt-3">
                {selected.citations.map((c, i) => (
                  <div key={i} className="text-[12px]">
                    <p className="font-mono text-matrix-500/80">
                      [{c.pageLabel}]
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
    </div>
  );
}

function MatrixCell({
  cell,
  onSelect,
  onRetry,
}: {
  cell: Cell | undefined;
  onSelect: () => void;
  onRetry: () => void;
}) {
  if (!cell) {
    return <span className="text-[12px] text-neutral-700">—</span>;
  }

  if (cell.status === "pending" || cell.status === "computing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-saffron-400">
        <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-saffron-500" />
        {cell.status === "pending" ? "queued…" : "reading…"}
      </span>
    );
  }

  if (cell.status === "failed") {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-[12px] text-red-400 hover:underline"
        title={cell.error ?? "Failed"}
      >
        <RotateCcw className="h-3 w-3" />
        failed — retry
      </button>
    );
  }

  const preview = (cell.answer ?? "").slice(0, 90);
  return (
    <button
      onClick={onSelect}
      className="text-left text-[13px] text-neutral-200 hover:text-white"
    >
      <span
        className={clsx(
          "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
          cell.grounded ? "bg-matrix-500" : "bg-red-500/70",
        )}
      />
      {preview}
      {(cell.answer ?? "").length > 90 ? "…" : ""}
    </button>
  );
}
