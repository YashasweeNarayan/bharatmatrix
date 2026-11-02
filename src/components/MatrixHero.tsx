"use client";

import { Fragment, useEffect, useState } from "react";
import clsx from "clsx";

type CellState = "idle" | "reading" | "filled";

type Cell = {
  value: string;
  source: string;
  flag?: "verified" | "conflict";
};

const ROWS = [
  "Annual_Report_2024.pdf",
  "Annual_Report_2025.pdf",
  "Investor_Presentation.pdf",
  "Audit_Report.pdf",
];

const COLS = ["Revenue", "Debt", "Auditor note"];

const DATA: Cell[][] = [
  [
    { value: "₹100 Cr", source: "p.12", flag: "verified" },
    { value: "₹30 Cr", source: "p.14", flag: "verified" },
    { value: "No major observation", source: "p.41", flag: "verified" },
  ],
  [
    { value: "₹130 Cr", source: "p.12", flag: "verified" },
    { value: "₹50 Cr", source: "p.15", flag: "verified" },
    { value: "Review required", source: "p.42", flag: "verified" },
  ],
  [
    { value: "₹145 Cr", source: "p.3", flag: "conflict" },
    { value: "₹50 Cr", source: "p.4", flag: "verified" },
    { value: "Not mentioned", source: "—" },
  ],
  [
    { value: "₹130 Cr", source: "p.1", flag: "verified" },
    { value: "₹52 Cr", source: "p.2", flag: "verified" },
    { value: "Qualified opinion", source: "p.6", flag: "verified" },
  ],
];

/** Order in which cells resolve, row-major, used to stagger the reveal. */
const SEQUENCE = ROWS.flatMap((_, r) => COLS.map((_, c) => [r, c] as const));

export default function MatrixHero() {
  const [states, setStates] = useState<CellState[][]>(
    ROWS.map(() => COLS.map(() => "idle")),
  );
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    let step = 0;
    let readingTimeouts: ReturnType<typeof setTimeout>[] = [];

    const interval = setInterval(() => {
      if (step >= SEQUENCE.length) {
        step = 0;
        setTimeout(() => {
          setStates(ROWS.map(() => COLS.map(() => "idle")));
          setCycle((c) => c + 1);
        }, 1800);
        return;
      }
      const [r, c] = SEQUENCE[step];
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = "reading";
        return next;
      });
      const t = setTimeout(() => {
        setStates((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = "filled";
          return next;
        });
      }, 420);
      readingTimeouts.push(t);
      step += 1;
    }, 240);

    return () => {
      clearInterval(interval);
      readingTimeouts.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/80 shadow-2xl shadow-black/40"
      role="img"
      aria-label="Animated preview of the BharatMatrix grid resolving document answers with sources"
    >
      <div className="flex items-center justify-between border-b border-ink-700 bg-ink-800/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-saffron-500" />
          <span className="text-[13px] text-neutral-400">
            ABC Technologies — Matrix
          </span>
        </div>
        <span className="font-mono text-[11px] text-neutral-500">
          4 docs · 3 questions
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] text-sm">
        <div className="border-b border-r border-ink-700 bg-ink-800/40 px-4 py-2.5 text-[12px] font-medium text-neutral-500">
          Document
        </div>
        {COLS.map((col) => (
          <div
            key={col}
            className="border-b border-r border-ink-700 bg-ink-800/40 px-4 py-2.5 text-[12px] font-medium text-neutral-500 last:border-r-0"
          >
            {col}
          </div>
        ))}

        {ROWS.map((row, r) => (
          <Fragment key={row}>
            <div
              className="truncate border-b border-r border-ink-700 px-4 py-3 font-mono text-[12px] text-neutral-400"
              title={row}
            >
              {row}
            </div>
            {COLS.map((col, c) => {
              const state = states[r][c];
              const cell = DATA[r][c];
              return (
                <div
                  key={col + row}
                  className="relative border-b border-r border-ink-700 px-4 py-3 last:border-r-0"
                >
                  {state === "idle" && (
                    <span className="inline-block h-3 w-16 rounded bg-ink-700/70" />
                  )}
                  {state === "reading" && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-matrix-400">
                      <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-matrix-400" />
                      reading…
                    </span>
                  )}
                  {state === "filled" && (
                    <span className="flex items-baseline gap-1.5">
                      <span
                        className={clsx(
                          "text-[13px]",
                          cell.flag === "conflict"
                            ? "text-red-400"
                            : "text-neutral-200",
                        )}
                      >
                        {cell.value}
                      </span>
                      {cell.source !== "—" && (
                        <span className="font-mono text-[10px] text-matrix-500/80">
                          [{cell.source}]
                        </span>
                      )}
                      {cell.flag === "conflict" && (
                        <span className="rounded bg-red-500/10 px-1 py-0.5 font-mono text-[9px] text-red-400">
                          conflict
                        </span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
