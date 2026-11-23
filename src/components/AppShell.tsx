"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function AppShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  // Open by default — on a phone this still starts closed because the
  // drawer would otherwise cover the whole screen on first paint.
  const [open, setOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024,
  );

  return (
    <div className="bg-grain flex min-h-screen bg-ink-950">
      <Sidebar email={email} open={open} onClose={() => setOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
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
        </header>

        <main className="mx-auto min-w-0 flex-1 px-4 py-8 md:px-8 lg:w-full lg:max-w-[1400px] lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
