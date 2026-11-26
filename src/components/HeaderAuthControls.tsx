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
          className="rounded-full px-3 py-2 text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-50"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-saffron-500 px-4 py-1.5 text-[13px] font-medium text-onaccent transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[200px] truncate text-[13px] text-neutral-500 lg:inline">
        {email}
      </span>
      <Link
        href="/workspace"
        className="rounded-full bg-saffron-500 px-4 py-1.5 text-[13px] font-medium text-onaccent transition-all hover:brightness-110 active:scale-[0.98]"
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
        className="rounded-full border border-ink-700 p-2 text-neutral-400 transition-colors hover:border-ink-600 hover:text-neutral-50 disabled:opacity-50"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
