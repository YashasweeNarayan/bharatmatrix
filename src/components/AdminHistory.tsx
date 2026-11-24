"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import clsx from "clsx";
import { groupByDate } from "@/lib/dateGroups";

type U = { id: string; email: string; username: string | null; conversations: number; questions: number; last_login_at: string | null };
type Conv = { id: string; title: string; channel: string; updated_at: string; turns: number };
type Turn = { id: string; question: string; answer: string; grounded: boolean; created_at: string; citations: { pageLabel: string; quote: string }[] };

export default function AdminHistory() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [q, setQ] = useState("");
  const [user, setUser] = useState<U | null>(null);
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [convId, setConvId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUsers(d.users))
      .catch(() => setError("Couldn't load users."));
  }, []);

  async function pickUser(u: U) {
    setUser(u);
    setConvs(null);
    setConvId(null);
    setTurns(null);
    setError(null);
    try {
      const r = await fetch(`/api/admin/history/${u.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setConvs((await r.json()).conversations);
    } catch {
      setError("Couldn't load that user's history.");
    }
  }

  async function pickConv(id: string) {
    setConvId(id);
    setTurns(null);
    try {
      const r = await fetch(`/api/admin/conversations/${id}`, { cache: "no-store" });
      if (!r.ok) throw new Error();
      setTurns((await r.json()).turns);
    } catch {
      setError("Couldn't load that conversation.");
    }
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (users ?? []).filter(
      (u) => !t || u.email.toLowerCase().includes(t) || (u.username ?? "").toLowerCase().includes(t),
    );
  }, [users, q]);

  const groups = convs ? groupByDate(convs, (c) => c.updated_at) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_280px_1fr]">
      <section className={clsx("rounded-2xl border border-ink-700 bg-ink-900/40 p-3", user && "hidden lg:block")}>
        <label className="flex items-center gap-2 rounded-lg border border-ink-700 px-2.5 py-1.5 focus-within:border-saffron-500">
          <Search className="h-3.5 w-3.5 text-neutral-600" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users" className="w-full bg-transparent text-[13px] text-neutral-200 outline-none placeholder:text-neutral-600" />
        </label>
        <div className="mt-2 max-h-[65vh] overflow-y-auto">
          {!users && !error && <Loader2 className="m-3 h-4 w-4 animate-spin text-neutral-600" />}
          {users && filtered.length === 0 && <p className="p-3 text-[12.5px] text-neutral-600">No users found.</p>}
          {filtered.map((u) => (
            <button key={u.id} onClick={() => pickUser(u)} className={clsx("flex w-full flex-col rounded-lg px-3 py-2 text-left", user?.id === u.id ? "bg-ink-800" : "hover:bg-ink-800/60")}>
              <span className="truncate text-[13px] text-neutral-200">{u.username || u.email}</span>
              <span className="truncate text-[11.5px] text-neutral-600">
                {u.username ? `${u.email} · ` : ""}{u.questions} question{u.questions === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={clsx("rounded-2xl border border-ink-700 bg-ink-900/40 p-3", (!user || convId) && "hidden lg:block")}>
        {!user ? (
          <p className="p-3 text-[12.5px] text-neutral-600">Pick a user to see their chats.</p>
        ) : (
          <>
            <button onClick={() => setUser(null)} className="mb-2 flex items-center gap-1.5 px-2 text-[12px] text-neutral-500 hover:text-neutral-200 lg:hidden">
              <ArrowLeft className="h-3.5 w-3.5" /> Users
            </button>
            <p className="truncate px-3 pb-2 text-[12px] text-neutral-500">{user.email}</p>
            <div className="max-h-[65vh] overflow-y-auto">
              {!convs && !error && <Loader2 className="m-3 h-4 w-4 animate-spin text-neutral-600" />}
              {convs && convs.length === 0 && <p className="p-3 text-[12.5px] text-neutral-600">No saved chats yet. Only chats from after this feature went live are recorded.</p>}
              {groups.map((g) => (
                <div key={g.label} className="mb-2">
                  <p className="px-3 pb-1 text-[11px] text-neutral-600">{g.label}</p>
                  {g.items.map((c) => (
                    <button key={c.id} onClick={() => pickConv(c.id)} className={clsx("block w-full truncate rounded-lg px-3 py-2 text-left text-[12.5px] text-neutral-300", convId === c.id ? "bg-ink-800" : "hover:bg-ink-800/60")} title={c.title}>
                      {c.channel === "telegram" && <span className="mr-1.5 text-neutral-600">TG</span>}
                      {c.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className={clsx("min-h-[40vh] rounded-2xl border border-ink-700 bg-ink-900/40 p-4", !convId && "hidden lg:block")}>
        {convId && (
          <button onClick={() => setConvId(null)} className="mb-3 flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 lg:hidden">
            <ArrowLeft className="h-3.5 w-3.5" /> Chats
          </button>
        )}
        {error && <p className="text-[13px] text-red-400">{error}</p>}
        {!convId && !error && <p className="text-[12.5px] text-neutral-600">Pick a chat to read it.</p>}
        {convId && !turns && !error && <Loader2 className="h-4 w-4 animate-spin text-neutral-600" />}
        {turns && (
          <div className="flex max-w-[680px] flex-col gap-6">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-2">
                <p className="self-end rounded-2xl rounded-br-sm bg-ink-800 px-4 py-2.5 text-[13.5px] text-neutral-100">{t.question}</p>
                <div className="rounded-2xl rounded-bl-sm border border-ink-700 bg-ink-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-neutral-200">{t.answer}</p>
                    <span className={clsx("flex-shrink-0 rounded-full px-2 py-0.5 text-[11px]", t.grounded ? "bg-matrix-500/10 text-matrix-400" : "bg-red-500/10 text-red-400")}>
                      {t.grounded ? "grounded" : "not found"}
                    </span>
                  </div>
                  {t.citations.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-ink-700 pt-3">
                      {t.citations.map((c, i) => (
                        <div key={i} className="text-[12px]">
                          <p className="font-mono text-neutral-500">{c.pageLabel}</p>
                          <p className="mt-0.5 italic text-neutral-400">&ldquo;{c.quote}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-neutral-600">{new Date(t.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
