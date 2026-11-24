"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

export default function AdminSetupForm() {
  const [email, setEmail] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, setupKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error ?? "Setup failed.");
      else setDone(true);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-[14px] text-neutral-100 outline-none focus:border-saffron-500";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
        Admin setup
      </h1>
      <p className="mt-1.5 text-[13px] text-neutral-400">
        One-time password creation for an admin email. Needs the setup key from
        the deployment settings.
      </p>
      {done ? (
        <p className="mt-6 text-[13px] text-matrix-400">
          Done.{" "}
          <Link href="/admin/login" className="underline">
            Go to admin login
          </Link>
          . Remove ADMIN_SETUP_KEY from the deployment once both admins are set up.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3.5">
          <input className={input} type="email" required placeholder="Admin email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" required placeholder="Setup key" autoComplete="off" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} />
          <input className={input} type="password" required minLength={12} maxLength={72} placeholder="New password (12+ characters)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
              {error}
            </p>
          )}
          <button disabled={busy} className="flex items-center justify-center gap-2 rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-onaccent hover:bg-saffron-400 disabled:opacity-60">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create admin password
          </button>
        </form>
      )}
    </div>
  );
}
