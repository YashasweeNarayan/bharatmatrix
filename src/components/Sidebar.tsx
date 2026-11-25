"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Home,
  LayoutGrid,
  FileText,
  Send,
  Settings,
  ClipboardCheck,
  LogOut,
  PanelLeftClose,
  Loader2,
  Users,
  FolderLock,
  ScrollText,
} from "lucide-react";
import { Suspense, useState } from "react";
import Avatar from "@/components/Avatar";
import HistoryList from "@/components/HistoryList";

const NAV = [
  { href: "/workspace", label: "Home", icon: Home },
  { href: "/matrix", label: "Matrix", icon: LayoutGrid },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/telegram", label: "Telegram Connect", icon: Send },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/evaluation", label: "Evaluations", icon: ClipboardCheck },
];

const ADMIN_NAV = [
  { href: "/admin/history", label: "User History", icon: Users },
  { href: "/admin/files", label: "User files", icon: FolderLock },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Pushes the rest of the dashboard rather than floating over it: on
 * desktop (lg+) this sits in normal flex flow, so closing it collapses
 * its own width to zero and the chat/documents columns beside it widen
 * to fill the space — nothing behind it ever disappears, it's just not
 * sharing the row anymore. Below lg there's no room to push without
 * squeezing the chat into uselessness, so it becomes a fixed drawer
 * with a dimming backdrop instead — the one place this component
 * departs from "push," and only because three columns genuinely don't
 * fit a phone's width.
 */
export default function Sidebar({
  email,
  username,
  avatarUrl,
  isAdmin = false,
  open,
  onClose,
}: {
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  isAdmin?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const displayName = username || email;

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-ink-900/85 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.28,0.11,0.32,1)] lg:static lg:z-auto lg:backdrop-blur-0",
          open
            ? "translate-x-0 border-r border-ink-700"
            : "-translate-x-full border-r border-ink-700 lg:w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0",
        )}
      >
        <div className="flex h-14 w-[260px] flex-shrink-0 items-center justify-between border-b border-ink-700 px-4">
          <Link
            href="/workspace"
            className="flex items-center gap-2.5 text-[14px] font-semibold tracking-tight text-neutral-100"
          >
            <span className="grid h-6 w-6 flex-shrink-0 grid-cols-2 grid-rows-2 gap-[2px]">
              <span className="rounded-[3px] bg-saffron-500" />
              <span className="rounded-[3px] bg-matrix-500" />
              <span className="rounded-[3px] bg-matrix-500" />
              <span className="rounded-[3px] bg-saffron-500" />
            </span>
            BharatMatrix
          </Link>
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-ink-800 hover:text-neutral-200"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex w-[260px] flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
          {(isAdmin ? ADMIN_NAV : NAV).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors duration-200",
                  active
                    ? "bg-ink-800 text-neutral-50 shadow-[inset_0_0_0_1px_rgb(var(--ink-700)/0.6)]"
                    : "text-neutral-400 hover:bg-ink-800/60 hover:text-neutral-100",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="w-[260px] flex-shrink-0">
          <Suspense fallback={null}>
            <HistoryList
              onNavigate={() => {
                if (window.innerWidth < 1024) onClose();
              }}
            />
          </Suspense>
        </div>

        <div className="w-[260px] flex-shrink-0 border-t border-ink-700 p-3">
          <div className="flex items-center gap-2 px-1 pb-2">
            <Avatar name={displayName} avatarUrl={avatarUrl} size={22} />
            <p className="truncate text-[12px] text-neutral-500" title={email}>
              {displayName}
            </p>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 flex-shrink-0" />
            )}
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
