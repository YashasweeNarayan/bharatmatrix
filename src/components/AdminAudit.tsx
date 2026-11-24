"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Entry = { id: number; admin_email: string; action: string; target: string | null; created_at: string };

export default function AdminAudit() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntries(d.entries))
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="text-[13px] text-red-400">Couldn&apos;t load the audit log.</p>;
  if (!entries) return <Loader2 className="h-4 w-4 animate-spin text-neutral-600" />;
  if (entries.length === 0) return <p className="text-[13px] text-neutral-500">Nothing logged yet.</p>;

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-700">
      <table className="w-full text-left text-[12.5px]">
        <thead className="border-b border-ink-700 text-neutral-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">When</th>
            <th className="px-4 py-2.5 font-medium">Admin</th>
            <th className="px-4 py-2.5 font-medium">Action</th>
            <th className="px-4 py-2.5 font-medium">Target</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-ink-800 last:border-0">
              <td className="whitespace-nowrap px-4 py-2 text-neutral-500">{new Date(e.created_at).toLocaleString()}</td>
              <td className="px-4 py-2 text-neutral-300">{e.admin_email}</td>
              <td className="px-4 py-2 font-mono text-neutral-300">{e.action}</td>
              <td className="max-w-[260px] truncate px-4 py-2 text-neutral-500" title={e.target ?? ""}>{e.target ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
