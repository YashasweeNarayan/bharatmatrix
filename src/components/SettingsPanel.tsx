"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Mail, CalendarDays, FileText, Bot } from "lucide-react";

export default function SettingsPanel({
  email,
  createdAt,
  documentCount,
  telegramLinked,
}: {
  email: string;
  createdAt: string;
  documentCount: number;
  telegramLinked: boolean;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const joined = new Date(createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
        <h2 className="text-[15px] font-semibold text-neutral-100">Account</h2>
        <dl className="mt-4 flex flex-col gap-3">
          <Row icon={Mail} label="Email" value={email} />
          <Row icon={CalendarDays} label="Member since" value={joined} />
          <Row
            icon={FileText}
            label="Documents uploaded"
            value={String(documentCount)}
          />
          <Row
            icon={Bot}
            label="Telegram"
            value={telegramLinked ? "Connected" : "Not connected"}
          />
        </dl>
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
        <h2 className="text-[15px] font-semibold text-neutral-100">
          Session
        </h2>
        <p className="mt-1.5 text-[13px] text-neutral-500">
          Sign out of BharatMatrix on this device.
        </p>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="mt-4 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-800 pb-3 last:border-0 last:pb-0">
      <dt className="flex items-center gap-2 text-[13px] text-neutral-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="truncate text-[13px] text-neutral-200">{value}</dd>
    </div>
  );
}
