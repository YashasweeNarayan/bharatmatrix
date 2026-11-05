"use client";

import { AlertTriangle, Download, X } from "lucide-react";
import {
  Cell,
  Citation,
  Contradiction,
  MatrixData,
  cellKey,
  citationsOf,
} from "@/lib/types";

/**
 * Step 7: the report panel. Deliberately built from data the grid has
 * already computed (matrix cells, citations, contradiction checks) rather
 * than a fresh Gemini call to "summarize" — the free tier's daily quota is
 * tight enough already (see PROGRESS.md's embedding saga) that a report
 * button shouldn't itself cost API quota every time someone opens it. The
 * summary numbers below are a deterministic rollup, not a generated one.
 *
 * "PDF export" is done via the browser's own print-to-PDF (window.print(),
 * scoped by the @media print rules in globals.css) rather than a new
 * client-side PDF library — no extra dependency to add sight-unseen from
 * this sandbox (no way to test an npm install here before Vercel's build
 * does), and every browser already does this reliably.
 */
export default function ReportPanel({
  data,
  onClose,
}: {
  data: MatrixData;
  onClose: () => void;
}) {
  const { documents, questions, cells, contradictions } = data;

  const cellMap = new Map<string, Cell>(
    cells.map((c) => [cellKey(c.document_id, c.question_id), c]),
  );
  const contradictionMap = new Map<string, Contradiction>(
    contradictions.map((c) => [c.question_id, c]),
  );

  const readyCells = cells.filter((c) => c.status === "ready");
  const groundedCells = readyCells.filter((c) => c.grounded);
  const flaggedQuestions = contradictions.filter(
    (c) => c.status === "ready" && c.has_contradiction,
  );

  // Flatten + dedupe every citation actually used by a grounded answer,
  // grouped by document, for the appendix at the end of the report.
  const citationsByDoc = new Map<string, Citation[]>();
  for (const cell of groundedCells) {
    for (const citation of citationsOf(cell)) {
      const key = citation.documentId;
      const seen = citationsByDoc.get(key) ?? [];
      const dupe = seen.some(
        (c) => c.pageLabel === citation.pageLabel && c.quote === citation.quote,
      );
      if (!dupe) seen.push(citation);
      citationsByDoc.set(key, seen);
    }
  }

  const filenameById = new Map(documents.map((d) => [d.id, d.filename]));
  const generatedAt = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        id="report-print-area"
        className="flex h-full w-full max-w-3xl flex-col bg-ink-950 shadow-2xl"
      >
        <div className="report-hide-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink-700 bg-ink-900/95 px-6 py-4 backdrop-blur">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-50">
              BharatMatrix Report
            </h2>
            <p className="text-[12px] text-neutral-500">Generated {generatedAt}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-saffron-500 px-3.5 py-2 text-[13px] font-medium text-ink-950 hover:bg-saffron-400"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              aria-label="Close report"
              className="rounded-lg p-2 text-neutral-500 hover:bg-ink-800 hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Print-only title block — the sticky header above is hidden
              when printing since its buttons make no sense on paper. */}
          <div className="report-print-only mb-6 hidden">
            <h1 className="text-xl font-semibold text-black">
              BharatMatrix Report
            </h1>
            <p className="text-[12px] text-neutral-600">Generated {generatedAt}</p>
          </div>

          <section>
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-neutral-500 report-print-heading">
              Summary
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Documents" value={documents.length} />
              <SummaryStat label="Questions" value={questions.length} />
              <SummaryStat
                label="Grounded answers"
                value={`${groundedCells.length}/${readyCells.length}`}
              />
              <SummaryStat
                label="Conflicts flagged"
                value={flaggedQuestions.length}
                warn={flaggedQuestions.length > 0}
              />
            </div>
          </section>

          <section className="mt-8">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-neutral-500 report-print-heading">
              Answers by document
            </h3>
            <div className="mt-3 flex flex-col gap-6">
              {questions.map((q) => {
                const contradiction = contradictionMap.get(q.id);
                const flagged =
                  contradiction?.status === "ready" &&
                  contradiction.has_contradiction;
                return (
                  <div
                    key={q.id}
                    className="rounded-lg border border-ink-700 p-4 report-print-block"
                  >
                    <p className="flex items-start gap-1.5 text-[13px] font-medium text-neutral-100 report-print-text-black">
                      {flagged && (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                      )}
                      {q.text}
                    </p>
                    {flagged && contradiction?.explanation && (
                      <p className="mt-1.5 text-[12px] text-red-400 report-print-text-black">
                        Conflict: {contradiction.explanation}
                      </p>
                    )}
                    <div className="mt-3 flex flex-col divide-y divide-ink-800 report-print-divide">
                      {documents.map((doc) => {
                        const cell = cellMap.get(cellKey(doc.id, q.id));
                        return (
                          <div key={doc.id} className="py-2.5 first:pt-0 last:pb-0">
                            <p className="font-mono text-[11px] text-matrix-500/80 report-print-text-black">
                              {filenameById.get(doc.id) ?? doc.id}
                            </p>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-300 report-print-text-black">
                              {renderCellText(cell)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {citationsByDoc.size > 0 && (
            <section className="mt-8">
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-neutral-500 report-print-heading">
                Citations
              </h3>
              <div className="mt-3 flex flex-col gap-4">
                {documents
                  .filter((doc) => citationsByDoc.has(doc.id))
                  .map((doc) => (
                    <div key={doc.id} className="report-print-block">
                      <p className="font-mono text-[12px] text-neutral-300 report-print-text-black">
                        {doc.filename}
                      </p>
                      <div className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-ink-700 pl-3">
                        {citationsByDoc.get(doc.id)!.map((c, i) => (
                          <div key={i} className="text-[12px]">
                            <span className="font-mono text-matrix-500/80 report-print-text-black">
                              [{c.pageLabel}]
                            </span>{" "}
                            <span className="italic text-neutral-500 report-print-text-black">
                              &ldquo;{c.quote}&rdquo;
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function renderCellText(cell: Cell | undefined) {
  if (!cell) return <span className="text-neutral-600">— not yet answered —</span>;
  if (cell.status === "pending" || cell.status === "computing") {
    return <span className="text-neutral-600">— still computing —</span>;
  }
  if (cell.status === "failed") {
    return <span className="text-red-400/80">— failed to answer —</span>;
  }
  if (!cell.grounded) {
    return (
      <span className="text-neutral-500">
        {cell.answer || "Not found in this document."}
      </span>
    );
  }
  return <>{cell.answer}</>;
}

function SummaryStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-ink-700 p-3 report-print-block">
      <p className="text-[11px] text-neutral-500 report-print-text-black">{label}</p>
      <p
        className={`mt-1 text-[18px] font-semibold report-print-text-black ${
          warn ? "text-red-400" : "text-neutral-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
