"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut } from "lucide-react";

const NAV = [
  { href: "/workspace", label: "Workspace" },
  { href: "/matrix", label: "Matrix" },
];

export default function AppShell({
  email,
  children,
}: {
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="bg-grain min-h-screen bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-ink-700 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[14px] font-semibold tracking-tight text-neutral-100"
            >
              <span className="grid h-6 w-6 grid-cols-2 grid-rows-2 gap-[2px]">
                <span className="rounded-[2px] bg-saffron-500" />
                <span className="rounded-[2px] bg-matrix-500" />
                <span className="rounded-[2px] bg-matrix-500" />
                <span className="rounded-[2px] bg-saffron-500" />
              </span>
              BharatMatrix
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-ink-800 text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-100",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[180px] truncate text-[13px] text-neutral-500 sm:inline">
              {email}
            </span>
            <button
              onClick={logout}
              disabled={loggingOut}
              title="Log out"
              aria-label="Log out"
              className="flex items-center gap-1.5 rounded-full border border-ink-700 px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:border-ink-600 hover:text-white disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        {/* Mobile nav — top bar is too narrow for the full nav above sm. */}
        <nav className="flex items-center gap-1 border-t border-ink-800 px-6 py-2 sm:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-ink-800 text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10 md:px-10">
        {children}
      </main>
    </div>
  );
}
