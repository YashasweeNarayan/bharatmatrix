"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { FileText, Loader2, RotateCcw, Upload, X } from "lucide-react";

type DocumentStatus = "processing" | "embedding" | "ready" | "failed";

export type DocumentRow = {
  id: string;
  filename: string;
  mime_type: string;
  status: DocumentStatus;
  page_count: number | null;
  error: string | null;
  created_at: string;
};

type DocumentPage = {
  ordinal: number;
  page_label: string;
  content: string;
};

const ACCEPTED =
  ".pdf,.docx,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "3m ago" / "2h ago" / "5d ago" — good enough resolution for an upload list. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * All document upload/list/indexing logic in one place, used two ways:
 * `compact` on the Home dashboard's right rail (short, scrollable list
 * next to the chat) and full-size on the dedicated Documents page. Both
 * own the exact same state and polling — there's one source of truth
 * for "what's uploaded and how far along is it," just two layouts over
 * it. `onDocsChange` lets the Home page read the ready-document list
 * back out (for the chat panel's citation filenames and ready count)
 * without re-fetching it a second time.
 */
export default function DocumentsPanel({
  compact = false,
  onDocsChange,
}: {
  compact?: boolean;
  onDocsChange?: (docs: DocumentRow[]) => void;
}) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pagesById, setPagesById] = useState<Record<string, DocumentPage[]>>(
    {},
  );
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const embedDraining = useRef(false);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDocs(data.documents ?? []);
  }, []);

  useEffect(() => {
    onDocsChange?.(docs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs]);

  // Embeds one batch of one document's chunks per call, refreshing after
  // each — same one-step-at-a-time pattern used for the Matrix grid, for
  // the same reason: trying to embed a whole large document in one request
  // risked both the platform's time limit and Gemini's per-minute rate
  // limit on a burst of calls.
  const drainEmbeddings = useCallback(async () => {
    if (embedDraining.current) return;
    embedDraining.current = true;
    let rateLimitStreak = 0;
    let lastRateLimitDetail: string | null = null;
    try {
      for (let i = 0; i < 500; i++) {
        const res = await fetch("/api/documents/embed-step", { method: "POST" });

        if (res.status === 429) {
          const body = await res.json().catch(() => null);
          lastRateLimitDetail = body?.detail ?? lastRateLimitDetail;

          if (body?.dailyLimit) {
            setEmbedError(
              "Hit Gemini's free-tier daily embedding limit — it resets after " +
                "roughly 24 hours from when the quota window started. " +
                "Indexing will resume automatically next time you open this " +
                "page once it clears." +
                (lastRateLimitDetail ? ` (${lastRateLimitDetail})` : ""),
            );
            await refresh();
            break;
          }

          rateLimitStreak += 1;
          if (rateLimitStreak > 8) {
            setEmbedError(
              "Indexing is stuck behind Gemini's rate limit for longer than " +
                "expected — try again in a minute." +
                (lastRateLimitDetail ? ` (${lastRateLimitDetail})` : ""),
            );
            await refresh();
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(3000 * rateLimitStreak, 20000)),
          );
          continue;
        }
        rateLimitStreak = 0;
        lastRateLimitDetail = null;

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setEmbedError(
            body?.detail || body?.error || `Indexing failed (${res.status}).`,
          );
          await refresh();
          break;
        }
        const json = await res.json();
        await refresh();
        if (json.done) break;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    } catch {
      setEmbedError("Lost connection while indexing a document — try again.");
    } finally {
      embedDraining.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "processing");
    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(refresh, 2500);
    }
    if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [docs, refresh]);

  useEffect(() => {
    if (docs.some((d) => d.status === "embedding")) drainEmbeddings();
  }, [docs, drainEmbeddings]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      setUploading((prev) => [...prev, ...list.map((f) => f.name)]);
      setEmbedError(null);

      // Deliberately sequential — see /api/documents/route.ts for why
      // (concurrent uploads once raced inside req.formData() parsing).
      // The upload *requests* have to stay one-at-a-time, but refreshing
      // and kicking off indexing after each one (instead of once at the
      // very end) is what makes several files feel like they're landing
      // one by one as each finishes, rather than all sitting in
      // "uploading…" together and then popping in at once when the last
      // one completes.
      for (const file of list) {
        const body = new FormData();
        body.append("file", file);
        try {
          await fetch("/api/documents", { method: "POST", body });
        } finally {
          setUploading((prev) => prev.filter((n) => n !== file.name));
        }
        await refresh();
        drainEmbeddings();
      }
    },
    [refresh, drainEmbeddings],
  );

  const toggleExpand = useCallback(
    async (id: string) => {
      if (expanded === id) {
        setExpanded(null);
        return;
      }
      setExpanded(id);
      if (!pagesById[id]) {
        const res = await fetch(`/api/documents/${id}`);
        if (res.ok) {
          const data = await res.json();
          setPagesById((prev) => ({ ...prev, [id]: data.pages ?? [] }));
        }
      }
    },
    [expanded, pagesById],
  );

  const removeDoc = useCallback(async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const retryDoc = useCallback(
    async (id: string) => {
      setEmbedError(null);
      await fetch(`/api/documents/${id}`, { method: "PATCH" });
      await refresh();
      drainEmbeddings();
    },
    [refresh, drainEmbeddings],
  );

  const readyCount = docs.filter((d) => d.status === "ready").length;
  const indexingCount = docs.filter(
    (d) => d.status === "processing" || d.status === "embedding",
  ).length;
  const failedCount = docs.filter((d) => d.status === "failed").length;

  return (
    <div
      className={clsx(
        "flex flex-col rounded-2xl border border-ink-700 bg-ink-900/40",
        compact && "h-full min-h-[70vh]",
      )}
    >
      <div
        className={clsx(
          "flex items-center justify-between gap-3 border-b border-ink-700 px-4",
          compact ? "py-3" : "py-4",
        )}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-saffron-500" />
          <h2
            className={clsx(
              "font-semibold text-neutral-100",
              compact ? "text-[13.5px]" : "text-[15px]",
            )}
          >
            Documents
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Tag label={`${readyCount} ready`} tone="matrix" />
          {indexingCount > 0 && (
            <Tag label={`${indexingCount} indexing`} tone="saffron" />
          )}
          {failedCount > 0 && <Tag label={`${failedCount} failed`} tone="red" />}
        </div>
      </div>

      {embedError && (
        <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
          <span>{embedError}</span>
          <button
            onClick={() => setEmbedError(null)}
            aria-label="Dismiss error"
            className="flex-shrink-0 text-red-400 hover:text-red-200"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          "mx-3 mt-3 flex cursor-pointer items-center gap-3 rounded-xl border px-3 transition-colors",
          compact ? "py-3" : "py-4",
          dragOver
            ? "border-saffron-500 bg-saffron-500/5"
            : "border-dashed border-ink-700 hover:bg-ink-800/40",
        )}
      >
        <Upload className="h-4 w-4 flex-shrink-0 text-saffron-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-neutral-200">
            Drop files here or click to upload
          </p>
          {!compact && (
            <p className="text-[11.5px] text-neutral-500">
              PDF, DOCX or XLSX. Upload several at once.
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className={clsx("flex-1 p-2", compact && "overflow-y-auto")}>
        {loading && (
          <p className="px-3 py-6 text-center text-[13px] text-neutral-500">
            Loading documents…
          </p>
        )}

        {!loading && docs.length === 0 && uploading.length === 0 && (
          <p className="px-3 py-10 text-center text-[13px] text-neutral-500">
            No documents yet. Upload your first file above.
          </p>
        )}

        <ul className="flex flex-col gap-1">
          {uploading.map((name) => (
            <li
              key={`uploading-${name}`}
              className="flex animate-fade-in-up items-center gap-3 rounded-xl px-3 py-3"
            >
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-saffron-500" />
              <span className="truncate text-[13px] text-neutral-300">
                Uploading {name}…
              </span>
            </li>
          ))}

          {docs.map((doc) => (
            <li
              key={doc.id}
              className="animate-fade-in-up rounded-xl transition-colors hover:bg-ink-800/50"
            >
              <div
                onClick={() => toggleExpand(doc.id)}
                className="flex cursor-pointer items-center gap-3 px-3 py-3"
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-mono text-[12.5px] text-neutral-200"
                    title={doc.filename}
                  >
                    {doc.filename}
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    {timeAgo(doc.created_at)}
                    {doc.page_count != null &&
                      ` · ${doc.page_count} page${doc.page_count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
                {doc.status === "failed" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryDoc(doc.id);
                    }}
                    aria-label={`Retry ${doc.filename}`}
                    className="rounded p-1.5 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDoc(doc.id);
                  }}
                  aria-label={`Remove ${doc.filename}`}
                  className="rounded p-1.5 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {doc.status === "failed" && doc.error && (
                <p className="border-t border-ink-700/60 px-3 py-2 text-[12px] text-red-400">
                  {doc.error}
                </p>
              )}

              {expanded === doc.id &&
                (doc.status === "ready" || doc.status === "embedding") && (
                  <div className="border-t border-ink-700/60 px-3 py-3">
                    {!pagesById[doc.id] ? (
                      <p className="text-[12px] text-neutral-500">Loading…</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {pagesById[doc.id].slice(0, 3).map((page) => (
                          <div key={page.ordinal}>
                            <p className="font-mono text-[10px] text-matrix-500/80">
                              [{page.page_label}]
                            </p>
                            <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-neutral-400">
                              {page.content.slice(0, 320)}
                              {page.content.length > 320 ? "…" : ""}
                            </p>
                          </div>
                        ))}
                        {pagesById[doc.id].length > 3 && (
                          <p className="text-[11px] text-neutral-600">
                            +{pagesById[doc.id].length - 3} more page
                            {pagesById[doc.id].length - 3 === 1 ? "" : "s"}{" "}
                            extracted
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Tag({
  label,
  tone,
}: {
  label: string;
  tone: "matrix" | "saffron" | "red";
}) {
  const toneClass = {
    matrix: "bg-matrix-500/10 text-matrix-400",
    saffron: "bg-saffron-500/10 text-saffron-400",
    red: "bg-red-500/10 text-red-400",
  }[tone];
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-[10.5px]", toneClass)}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  if (status === "processing") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-saffron-500/10 px-2 py-0.5 text-[11px] text-saffron-400">
        <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-saffron-500" />
        reading
      </span>
    );
  }
  if (status === "embedding") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-saffron-500/10 px-2 py-0.5 text-[11px] text-saffron-400">
        <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-saffron-500" />
        indexing
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">
        failed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-matrix-500/10 px-2 py-0.5 text-[11px] text-matrix-400">
      ready
    </span>
  );
}
