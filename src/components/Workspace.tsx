"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { FileText, Loader2, Upload, X } from "lucide-react";

type DocumentStatus = "processing" | "ready" | "failed";

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

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (!res.ok) return;
    const data = await res.json();
    setDocs(data.documents ?? []);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Poll while anything is still processing.
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

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      setUploading((prev) => [...prev, ...list.map((f) => f.name)]);

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
      refresh();
    },
    [refresh],
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

  return (
    <div className="mx-auto max-w-4xl px-6 py-14 md:px-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
        Workspace
      </h1>
      <p className="mt-2 text-[14px] text-neutral-400">
        Upload annual reports, investor decks or audit reports. BharatMatrix
        reads them page by page so every future answer can point back to
        exactly where it came from.
      </p>

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

              {expanded === doc.id && doc.status === "ready" && (
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
