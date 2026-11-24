"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Lock, LockOpen } from "lucide-react";

type Vault = {
  required: number;
  minutes: number;
  approvals: number;
  mine: boolean;
  unlocked: boolean;
  expiresAt: string | null;
};

/**
 * Header button beside the theme switch (admins only). Each admin presses
 * it to approve file access; files open only once the required number of
 * different admins have approved. Pressing again withdraws your approval.
 */
export default function VaultButton() {
  const router = useRouter();
  const [vault, setVault] = useState<Vault | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vault", { cache: "no-store" });
      if (res.ok) setVault((await res.json()).vault);
    } catch {
      /* keep the last known state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function press() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/vault", { method: "POST" });
      if (!res.ok) throw new Error();
      setVault((await res.json()).vault);
      window.dispatchEvent(new Event("bm:vault-changed"));
      router.refresh();
    } catch {
      setError("Couldn't update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const label = !vault
    ? "Files"
    : vault.unlocked
      ? "Files unlocked"
      : vault.mine
        ? `Waiting (${vault.approvals}/${vault.required})`
        : `Unlock files (${vault.approvals}/${vault.required})`;

  const title = !vault
    ? ""
    : vault.unlocked
      ? `Open for you. Approval lapses in ${vault.minutes} min unless renewed. Click to lock.`
      : vault.mine
        ? `You approved. Another admin must approve within ${vault.minutes} min. Click to withdraw.`
        : `${vault.required} admins must each press this to open user files.`;

  return (
    <div className="relative">
      <button
        onClick={press}
        disabled={busy || !vault}
        title={error ?? title}
        className={clsx(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60",
          vault?.unlocked
            ? "border-matrix-500/40 bg-matrix-500/10 text-matrix-400"
            : vault?.mine
              ? "border-saffron-500/50 bg-saffron-500/10 text-saffron-400"
              : "border-ink-700 text-neutral-300 hover:border-saffron-500 hover:text-saffron-400",
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : vault?.unlocked ? (
          <LockOpen className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
    </div>
  );
}
