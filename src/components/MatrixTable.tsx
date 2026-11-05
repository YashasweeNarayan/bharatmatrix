"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, FileText, Loader2, Plus, RotateCcw, X } from "lucide-react";
import ReportPanel from "@/components/ReportPanel";
import { Cell, Contradiction, MatrixData, cellKey, citationsOf } from "@/lib/types";

export default function MatrixTable() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [selected, setSelected] = useState<Cell | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkingContradictions, setCheckingContradictions] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const draining = useRef(false);
  const contradictionsDraining = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/matrix", { cache: "no-store" });
    if (!res.ok) {
      setErrorMsg(`Couldn't load the matrix (${res.status}).`);
      return;
    }
    const json = await res.json();
    setData(json);
    return json as MatrixData;
  }, []);

  // Computes pending/stuck cells one at a time via /api/matrix/step,
  // refreshing the grid after each so cells fill in live, instead of one
  // request trying to await every cell's Gemini call at once (that reliably
  // got killed by Vercel's ~10s request limit before it could respond).
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/matrix/step", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setErrorMsg(
            body?.detail || body?.error || `Step failed (${res.status}).`,
          );
          break;
        }
        const json = await res.json();
        await refresh();
        if (json.done) break;
      }
    } catch {
      setErrorMsg("Lost connection while computing cells — try again.");
    } finally {
      draining.current = false;
    }
  }, [refresh]);

  // Same one-cell-per-request pattern, for the contradiction-check queue.
  const drainContradictions = useCallback(async () => {
    if (contradictionsDraining.current) return;
    contradictionsDraining.current = true;
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/contradictions/step", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setErrorMsg(
            body?.detail ||
              body?.error ||
              `Contradiction check failed (${res.status}).`,
          );
          break;
        }
        const json = await res.json();
        await refresh();
        if (json.done) break;
      }
    } catch {
      setErrorMsg("Lost connection while checking contradictions — try again.");
    } finally {
      contradictionsDraining.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Auto-resume if there are already pending/computing cells (e.g. from a
  // question added just before a page reload) — this is finishing work
  // already requested, not a new unprompted Gemini call.
  useEffect(() => {
    const hasActive = data?.cells.some(
      (c) => c.status === "pending" || c.status === "computing",
    );
    if (hasActive) drain();
    const hasActiveCheck = data?.contradictions.some(
      (c) => c.status === "pending" || c.status === "computing",
    );
    if (hasActiveCheck) drainContradictions();
  }, [data, drain, drainContradictions]);

  const cellMap = new Map<string, Cell>();
  data?.cells.forEach((c) => cellMap.set(cellKey(c.document_id, c.question_id), c));

  const contradictionMap = new Map<string, Contradiction>();
  data?.contradictions.forEach((c) => contradictionMap.set(c.question_id, c));

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
    setErrorMsg(null);
    setAddingQuestion(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newQuestion.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrorMsg(body?.error || `Couldn't add the question (${res.status}).`);
        return;
      }
      setNewQuestion("");
      await refresh();
      drain();
    } catch {
      setErrorMsg("Lost connection while adding the question — try again.");
    } finally {
      setAddingQuestion(false);
    }
  }

  async function removeQuestion(id: string) {
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setErrorMsg(`Couldn't remove the question (${res.status}).`);
        return;
      }
      await refresh();
    } catch {
      setErrorMsg("Lost connection while removing the question — try again.");
    }
  }

  async function retryCell(documentId: string, questionId: string) {
    setErrorMsg(null);
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
    try {
      const res = await fetch("/api/matrix/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, questionId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErrorMsg(body?.detail || body?.error || `Retry failed (${res.status}).`);
      }
      await refresh();
    } catch {
      setErrorMsg("Lost connection while retrying — try again.");
      await refresh();
    }
  }

  async function checkContradictions() {
    setErrorMsg(null);
    setCheckingContradictions(true);
    try {
      const res = await fetch("/api/contradictions/queue", { method: "POST" });
      if (!res.ok) {
        setErrorMsg(`Couldn't start the contradiction check (${res.status}).`);
        return;
      }
      const json = await res.json();
      if (json.queued === 0) {
        setErrorMsg(
          "Nothing to check yet — a question needs a grounded answer " +
            "from at least two documents before it can be compared.",
        );
        return;
      }
      await refresh();
      drainContradictions();
    } catch {
      setErrorMsg("Lost connection while starting the contradiction check.");
    } finally {
      setCheckingContradictions(false);
    }
  }

  async function backfill() {
    setErrorMsg(null);
    setBackfilling(true);
    try {
      const res = await fetch("/api/matrix/backfill", { method: "POST" });
      if (!res.ok) {
        setErrorMsg(`Couldn't fill missing cells (${res.status}).`);
        return;
      }
      await refresh();
      drain();
    } catch {
      setErrorMsg("Lost connection while filling missing cells — try again.");
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
        {data.questions.length > 0 && (
          <button
            onClick={checkContradictions}
            disabled={checkingContradictions}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2.5 text-[13px] text-neutral-300 hover:bg-ink-800"
          >
            {checkingContradictions ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            Check contradictions
          </button>
        )}
        {data.questions.length > 0 && (
          <button
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-ink-700 px-3.5 py-2.5 text-[13px] text-neutral-300 hover:bg-ink-800"
          >
            <FileText className="h-3.5 w-3.5" />
            Report
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
                {data.questions.map((q) => {
                  const contradiction = contradictionMap.get(q.id);
                  return (
                    <th
                      key={q.id}
                      className="min-w-[220px] border-b border-r border-ink-700 bg-ink-800/60 px-4 py-2.5 text-[12px] font-medium text-neutral-300 last:border-r-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-start gap-1.5">
                          {contradiction?.status === "ready" &&
                            contradiction.has_contradiction && (
                              <AlertTriangle
                                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400"
                                aria-label="Conflicting answers across documents"
                              />
                            )}
                          {q.text}
                        </span>
                        <button
                          onClick={() => removeQuestion(q.id)}
                          aria-label={`Remove question "${q.text}"`}
                          className="flex-shrink-0 rounded p-0.5 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </th>
                  );
                })}
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
                {String(selected.answer ?? "")}
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
            {selected.verification_note && (
              <p className="mt-2 text-[12px] text-saffron-400/80">
                Verifier: {selected.verification_note}
              </p>
            )}
            {citationsOf(selected).length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-ink-700 pt-3">
                {citationsOf(selected).map((c, i) => (
                  <div key={i} className="text-[12px]">
                    <p className="font-mono text-matrix-500/80">
                      [{String(c?.pageLabel ?? "")}]
                    </p>
                    <p className="mt-0.5 italic text-neutral-400">
                      &ldquo;{String(c?.quote ?? "")}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {data.contradictions.length > 0 && (
        <div className="mt-8 border-t border-ink-700 pt-6">
          <h3 className="text-[13px] font-medium text-neutral-300">
            Contradictions
          </h3>
          {(() => {
            const flagged = data.contradictions.filter(
              (c) => c.status === "ready" && c.has_contradiction,
            );
            if (flagged.length === 0) {
              return (
                <p className="mt-2 text-[13px] text-neutral-600">
                  No conflicts found across your documents&apos; grounded
                  answers.
                </p>
              );
            }
            return (
              <div className="mt-3 flex flex-col gap-2">
                {flagged.map((c) => {
                  const q = data.questions.find((q) => q.id === c.question_id);
                  return (
                    <div
                      key={c.question_id}
                      className="rounded-lg border border-red-500/30 bg-red-500/5 p-3"
                    >
                      <p className="flex items-start gap-1.5 text-[13px] text-neutral-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                        {q?.text ?? "Question"}
                      </p>
                      <p className="mt-1 text-[12px] text-neutral-400">
                        {c.explanation}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {reportOpen && (
        <ReportPanel data={data} onClose={() => setReportOpen(false)} />
      )}
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
