"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Loader2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import clsx from "clsx";

type LinkCodeResponse = {
  code: string;
  expiresAt: string;
  botUsername: string | null;
  deepLink: string | null;
};

/**
 * A fresh code (and therefore a fresh QR image) is minted every time this
 * card is opened or refreshed — the code itself is single-use and expires
 * in 10 minutes (see /api/telegram/link-code), but every code minted for
 * the same logged-in user resolves to the exact same account on the bot
 * side (telegram_links is keyed by chat_id, upserted on every /start,
 * not by code) — so scanning an old screenshot's QR won't work once it
 * expires, but scanning today's always links the same account.
 */
export default function TelegramConnect() {
  const [loading, setLoading] = useState(true);
  const [linkInfo, setLinkInfo] = useState<LinkCodeResponse | null>(null);
  const [linkedChatCount, setLinkedChatCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const generateCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/telegram/link-code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't generate a code.");
      } else {
        setLinkInfo(data);
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/link-code", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLinkedChatCount(data.links?.length ?? 0);
    } catch {
      // Non-critical — the QR code still works even if this check fails.
    }
  }, []);

  useEffect(() => {
    generateCode();
    refreshStatus();
  }, [generateCode, refreshStatus]);

  // Countdown display + auto-regenerate once a code expires, so the card
  // never shows a dead QR code to someone who leaves the tab open.
  useEffect(() => {
    if (!linkInfo) return;
    const expiresAt = new Date(linkInfo.expiresAt).getTime();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        generateCode();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [linkInfo, generateCode]);

  async function unlink() {
    setUnlinking(true);
    try {
      await fetch("/api/telegram/link-code", { method: "DELETE" });
      await refreshStatus();
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-saffron-500" />
        <h2 className="text-[15px] font-semibold text-neutral-100">
          Connect Telegram
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-neutral-500">
        Scan with your phone&apos;s camera to ask BharatMatrix questions
        from Telegram — answered the same way, only from your own
        documents.
      </p>

      {linkedChatCount != null && linkedChatCount > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-matrix-500/30 bg-matrix-500/10 px-3 py-2">
          <p className="text-[12.5px] text-matrix-400">
            Connected · {linkedChatCount} chat
            {linkedChatCount === 1 ? "" : "s"}
          </p>
          <button
            onClick={unlink}
            disabled={unlinking}
            className="flex items-center gap-1 text-[12px] text-neutral-500 hover:text-red-400"
          >
            {unlinking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unlink className="h-3 w-3" />
            )}
            Unlink
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-ink-700 bg-ink-950/60 p-5">
        {loading && !linkInfo ? (
          <div className="flex h-[180px] w-[180px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-600" />
          </div>
        ) : error ? (
          <p className="text-[13px] text-red-400">{error}</p>
        ) : linkInfo?.deepLink ? (
          <>
            <div className="rounded-lg bg-white p-3">
              <QRCode value={linkInfo.deepLink} size={160} />
            </div>
            <p className="font-mono text-[11px] text-neutral-500">
              or send &ldquo;/start {linkInfo.code}&rdquo; to the bot
            </p>
            <p
              className={clsx(
                "text-[11px]",
                secondsLeft <= 30 ? "text-saffron-400" : "text-neutral-600",
              )}
            >
              Refreshes in {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, "0")}
            </p>
          </>
        ) : (
          <p className="text-center text-[12.5px] text-neutral-500">
            The Telegram bot isn&apos;t configured on this deployment yet
            (missing TELEGRAM_BOT_USERNAME). You can still use the code
            below once a bot is set up.
            {linkInfo && (
              <span className="mt-2 block font-mono text-neutral-300">
                /start {linkInfo.code}
              </span>
            )}
          </p>
        )}
      </div>

      <button
        onClick={generateCode}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-[12.5px] text-neutral-400 transition-colors hover:border-saffron-500 hover:text-saffron-400"
      >
        <RefreshCw className={clsx("h-3 w-3", loading && "animate-spin")} />
        New code
      </button>
    </div>
  );
}
