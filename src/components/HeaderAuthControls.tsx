"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export default function HeaderAuthControls({
  email,
}: {
  email: string | null;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!email) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="rounded-full px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:text-white"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-medium text-ink-950 transition-colors hover:bg-white"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-[13px] text-neutral-500 sm:inline">
        {email}
      </span>
      <Link
        href="/workspace"
        className="rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-medium text-ink-950 transition-colors hover:bg-white"
      >
        Open workspace
      </Link>
      <button
        onClick={async () => {
          setLoggingOut(true);
          await fetch("/api/auth/logout", { method: "POST" });
          router.refresh();
          setLoggingOut(false);
        }}
        disabled={loggingOut}
        title="Log out"
        aria-label="Log out"
        className="rounded-full border border-ink-700 p-2 text-neutral-400 transition-colors hover:border-ink-600 hover:text-white disabled:opacity-50"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
