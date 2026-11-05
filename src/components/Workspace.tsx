"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { FileText, Loader2, RotateCcw, Upload, X } from "lucide-react";
import AskPanel from "@/components/AskPanel";

type DocumentStatus = "processing" | "embedding" | "ready" | "failed";

type DocumentRow = {
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

export default function Workspace() {
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

  // Embeds one batch of one document's chunks per call, refreshing after
  // each — same one-step-at-a-time pattern used for the Matrix grid, for
  // the same reason: trying to embed a whole large document in one request
  // risked both the platform's time limit and Gemini's per-minute rate
  // limit on a burst of calls.
  const drainEmbeddings = useCallback(async () => {
    if (embedDraining.current) return;
    embedDraining.current = true;
    let rateLimitStreak = 0;
    try {
      for (let i = 0; i < 500; i++) {
        const res = await fetch("/api/documents/embed-step", { method: "POST" });

        if (res.status === 429) {
          // Gemini's per-minute embedding quota is full — transient, not a
          // real failure. Don't stop the drain: wait it out (growing a
          // little each time, capped at 20s) and keep going. Only give up
          // and surface an error after a long sustained run of these.
          rateLimitStreak += 1;
          if (rateLimitStreak > 15) {
            setEmbedError(
              "Indexing is stuck behind Gemini's rate limit for longer than " +
                "expected — try again in a minute.",
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

  // Cheap DB-only poll while a document is still being extracted — this
  // normally finishes within the upload request itself, but polling here
  // costs nothing and covers it either way.
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

  // Auto-resume indexing any document still mid-embedding (e.g. from
  // before a page reload) — finishing already-requested work, not a new
  // unprompted Gemini call.
  useEffect(() => {
    if (docs.some((d) => d.status === "embedding")) drainEmbeddings();
  }, [docs, drainEmbeddings]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      setUploading((prev) => [...prev, ...list.map((f) => f.name)]);
      setEmbedError(null);

      await Promise.all(
        list.map(async (file) => {
          const body = new FormData();
          body.append("file", file);
          try {
            await fetch("/api/documents", { method: "POST", body });
          } finally {
            setUploading((prev) => prev.filter((n) => n !== file.name));
          }
        }),
      );
      await refresh();
      drainEmbeddings();
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

  const removeDoc = useCallback(
    async (id: string) => {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    },
    [],
  );

  const retryDoc = useCallback(
    async (id: string) => {
      setEmbedError(null);
      await fetch(`/api/documents/${id}`, { method: "PATCH" });
      await refresh();
      drainEmbeddings();
    },
    [refresh, drainEmbeddings],
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-14 md:px-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          Workspace
        </h1>
        <Link
          href="/matrix"
          className="rounded-full border border-ink-700 px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:border-ink-600 hover:text-white"
        >
          Open matrix →
        </Link>
      </div>
      <p className="mt-2 text-[14px] text-neutral-400">
        Upload annual reports, investor decks or audit reports. BharatMatrix
        reads them page by page so every future answer can point back to
        exactly where it came from.
      </p>

      {embedError && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          <span>{embedError}</span>
          <button
            onClick={() => setEmbedError(null)}
            aria-label="Dismiss error"
            className="flex-shrink-0 text-red-400 hover:text-red-200"
          >
            <X className="h-3.5 w-3.5" />
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
          "mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragOver
            ? "border-saffron-500 bg-saffron-500/5"
            : "border-ink-700 hover:border-ink-600",
        )}
      >
        <Upload className="h-6 w-6 text-neutral-500" />
        <p className="mt-3 text-[14px] text-neutral-300">
          Drop files here, or click to browse
        </p>
        <p className="mt-1 text-[12px] text-neutral-500">
          PDF, DOCX or XLSX — multiple files at once
        </p>
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

      <div className="mt-10">
        {loading && (
          <p className="text-[13px] text-neutral-500">Loading documents…</p>
        )}

        {!loading && docs.length === 0 && uploading.length === 0 && (
          <p className="text-[13px] text-neutral-500">
            No documents uploaded yet.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {uploading.map((name) => (
            <li
              key={`uploading-${name}`}
              className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3"
            >
              <Loader2 className="h-4 w-4 animate-spin text-saffron-500" />
              <span className="truncate text-[13px] text-neutral-300">
                Uploading {name}…
              </span>
            </li>
          ))}

          {docs.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-ink-700 bg-ink-900/60"
            >
              <div
                onClick={() => toggleExpand(doc.id)}
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                <span
                  className="flex-1 truncate font-mono text-[13px] text-neutral-200"
                  title={doc.filename}
                >
                  {doc.filename}
                </span>
                <StatusBadge status={doc.status} />
                {doc.page_count != null && (
                  <span className="text-[12px] text-neutral-500">
                    {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
                  </span>
                )}
                {doc.status === "failed" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryDoc(doc.id);
                    }}
                    aria-label={`Retry ${doc.filename}`}
                    className="rounded p-1 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
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
                  className="rounded p-1 text-neutral-600 hover:bg-ink-700 hover:text-neutral-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {doc.status === "failed" && doc.error && (
                <p className="border-t border-ink-700 px-4 py-2 text-[12px] text-red-400">
                  {doc.error}
                </p>
              )}

              {expanded === doc.id &&
                (doc.status === "ready" || doc.status === "embedding") && (
                <div className="border-t border-ink-700 px-4 py-3">
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
                          {pagesById[doc.id].length - 3 === 1 ? "" : "s"}
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

      <AskPanel
        readyCount={docs.filter((d) => d.status === "ready").length}
        filenameById={Object.fromEntries(
          docs.map((d) => [d.id, d.filename]),
        )}
      />
    </div>
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
