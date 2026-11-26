"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Avatar from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import VaultButton from "@/components/VaultButton";

export default function AppShell({
  email,
  username,
  avatarUrl,
  isAdmin = false,
  children,
}: {
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const displayName = username || email;
  // Open by default — on a phone this still starts closed because the
  // drawer would otherwise cover the whole screen on first paint.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024,
  );

  return (
    <div className="app-shell bg-grain flex h-[100dvh] overflow-hidden bg-ink-950">
      <Sidebar
        email={email}
        username={username}
        avatarUrl={avatarUrl}
        isAdmin={isAdmin}
        open={open}
        onClose={() => setOpen(false)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 flex-shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-950/85 px-4 backdrop-blur md:px-6">
          {!open && (
            <button
              onClick={() => setOpen(true)}
              aria-label="Open sidebar"
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-ink-800 hover:text-neutral-100"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
          {!open && (
            <span className="flex items-center gap-2.5 text-[14px] font-semibold tracking-tight text-neutral-100">
              <span className="grid h-5 w-5 flex-shrink-0 grid-cols-2 grid-rows-2 gap-[2px]">
                <span className="rounded-[2px] bg-saffron-500" />
                <span className="rounded-[2px] bg-matrix-500" />
                <span className="rounded-[2px] bg-matrix-500" />
                <span className="rounded-[2px] bg-saffron-500" />
              </span>
              BharatMatrix
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            {isAdmin && <VaultButton />}
            <ThemeToggle />
            <Link
              href="/settings"
              title="Settings"
              className="flex items-center gap-2 rounded-full border border-transparent py-1 pl-1 pr-1 transition-colors hover:border-ink-700 hover:bg-ink-800/60 sm:pr-3"
            >
              <Avatar name={displayName} avatarUrl={avatarUrl} size={26} />
              <span className="hidden max-w-[160px] truncate text-[13px] text-neutral-300 sm:inline">
                {displayName}
              </span>
            </Link>
          </div>
        </header>

        {/* The page itself never scrolls: the header and sidebar stay put and
            this area scrolls on its own. Workspace splits it further. */}
        <main className="app-main min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto min-w-0 px-4 py-8 md:px-8 lg:w-full lg:max-w-[1400px] lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
