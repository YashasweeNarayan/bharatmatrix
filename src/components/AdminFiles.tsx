"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2, Lock } from "lucide-react";
import clsx from "clsx";

type FileRow = { id: string; filename: string; mimeType: string; status: string; pageCount: number | null; createdAt: string; url: string };
type UserFiles = { userId: string; email: string; username: string | null; files: FileRow[] };
type Vault = { required: number; approvals: number; mine: boolean; unlocked: boolean; minutes: number };

/**
 * Locked until the two-admin rule is met. The server refuses the data
 * (403) while locked — this component only reflects that.
 */
export default function AdminFiles() {
  const [users, setUsers] = useState<UserFiles[] | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [locked, setLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/files", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 403 && data?.locked) {
        setLocked(true);
        setUsers(null);
        setVault(data.vault);
      } else if (res.ok) {
        setLocked(false);
        setUsers(data.users);
        setVault(data.vault);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    window.addEventListener("bm:vault-changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("bm:vault-changed", load);
    };
  }, [load]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-neutral-600" />;

  if (locked) {
    return (
      <div className="flex max-w-lg flex-col items-start gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-6">
        <Lock className="h-6 w-6 text-saffron-500" />
        <h2 className="text-[15px] font-semibold text-neutral-100">This section is locked</h2>
        <p className="text-[13px] leading-relaxed text-neutral-400">
          User files open only when {vault?.required ?? 2} admins have each
          pressed the lock button at the top right. Approvals last{" "}
          {vault?.minutes ?? 60} minutes.
        </p>
        <p className="text-[13px] text-neutral-300">
          {vault ? `${vault.approvals} of ${vault.required} approved` : ""}
          {vault?.mine ? " (including you)." : vault ? ". You haven't approved yet." : ""}
        </p>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return <p className="text-[13px] text-neutral-500">No user has uploaded a file yet.</p>;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2">
      {users.map((u) => {
        const open = openId === u.userId;
        return (
          <div key={u.userId} className="rounded-xl border border-ink-700 bg-ink-900">
            <button
              onClick={() => setOpenId(open ? null : u.userId)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-neutral-100">
                {u.username || u.email}
                {u.username && <span className="ml-2 text-[12px] text-neutral-500">{u.email}</span>}
              </span>
              <span className="text-[12px] text-neutral-500">{u.files.length} file{u.files.length === 1 ? "" : "s"}</span>
              <ChevronDown className={clsx("h-4 w-4 text-neutral-500 transition-transform", open && "rotate-180")} />
            </button>
            {open && (
              <ul className="border-t border-ink-700 px-2 py-2">
                {u.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-neutral-300 hover:bg-ink-800"
                    >
                      <FileText className="h-4 w-4 flex-shrink-0 text-neutral-500" />
                      <span className="min-w-0 flex-1 truncate">{f.filename}</span>
                      <span className="text-[11.5px] text-neutral-600">
                        {f.pageCount ? `${f.pageCount} p · ` : ""}
                        {new Date(f.createdAt).toLocaleDateString()}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
