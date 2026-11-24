"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, History, Loader2, Plus, Trash2 } from "lucide-react";
import { groupByDate } from "@/lib/dateGroups";

type Conv = { id: string; title: string; channel: string; updated_at: string };

/**
 * "History (Personal)": the signed-in person's own past chats, grouped by
 * date like Claude's sidebar. Click one to reopen and continue it.
 * Lives in the sidebar just above Sign out, for users and admins alike.
 */
export default function HistoryList({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const activeId = useSearchParams().get("c");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Conv[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { conversations: Conv[] };
      setItems(data.conversations);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (open && items === null) load();
  }, [open, items, load]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener("bm:history-changed", refresh);
    return () => window.removeEventListener("bm:history-changed", refresh);
  }, [load]);

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    setItems((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    await fetch(`/api/history/${id}`, { method: "DELETE" }).catch(() => {});
    if (activeId === id) router.push("/workspace?new=1");
  }

  const groups = items ? groupByDate(items, (c) => c.updated_at) : [];

  return (
    <div className="border-t border-ink-700">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-6 py-3 text-[13.5px] font-medium text-neutral-400 transition-colors hover:text-neutral-100"
      >
        <History className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">History (Personal)</span>
        <ChevronDown
          className={clsx("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto px-3 pb-3">
          <Link
            href={`/workspace?new=${Date.now()}`}
            onClick={onNavigate}
            className="mb-2 flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-[12.5px] text-neutral-300 hover:border-saffron-500 hover:text-saffron-400"
          >
            <Plus className="h-3.5 w-3.5" /> New chat
          </Link>

          {items === null && !error && (
            <p className="flex items-center gap-2 px-3 py-2 text-[12px] text-neutral-600">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          )}
          {error && (
            <p className="px-3 py-2 text-[12px] text-red-400">
              Couldn&apos;t load history.{" "}
              <button onClick={load} className="underline">
                Retry
              </button>
            </p>
          )}
          {items && items.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-neutral-600">
              No chats yet. Ask a question and it will appear here.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.label} className="mt-2">
              <p className="px-3 pb-1 text-[11px] text-neutral-600">{g.label}</p>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  className={clsx(
                    "group flex items-center rounded-lg",
                    activeId === c.id ? "bg-ink-800" : "hover:bg-ink-800/60",
                  )}
                >
                  <Link
                    href={`/workspace?c=${c.id}`}
                    onClick={onNavigate}
                    title={c.title}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-[12.5px] text-neutral-300"
                  >
                    {c.channel === "telegram" && (
                      <span className="mr-1.5 text-neutral-600">TG</span>
                    )}
                    {c.title}
                  </Link>
                  <button
                    onClick={() => remove(c.id)}
                    aria-label={`Delete ${c.title}`}
                    className="mr-1 rounded p-1.5 text-neutral-600 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
