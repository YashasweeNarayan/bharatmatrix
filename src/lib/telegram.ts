const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.warn(
    "[telegram] TELEGRAM_BOT_TOKEN is not set — the Telegram bot will be " +
      "unreachable until it's added in Vercel's Environment Variables.",
  );
}

/**
 * Telegram's Bot API is just plain HTTPS — no SDK needed. sendMessage is
 * the only call this project makes outbound (everything inbound arrives
 * via the webhook route instead of polling, since a long-poll loop has
 * nowhere to live in a stateless serverless function).
 *
 * parse_mode is deliberately left unset (plain text) rather than
 * "MarkdownV2": Telegram's MarkdownV2 requires escaping a long list of
 * characters (., -, !, (, ), etc.) in ordinary prose, and an unescaped
 * one anywhere in a generated answer or a quoted citation makes the
 * whole send fail with a 400 — far more likely to break a real answer
 * than plain text is to look slightly worse.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<void> {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  // Telegram rejects messages over 4096 UTF-16 code units outright, so a
  // long grounded answer plus citations is truncated with a clear marker
  // rather than silently failing to send at all.
  const MAX_LEN = 4096;
  const body =
    text.length > MAX_LEN
      ? text.slice(0, MAX_LEN - 20) + "\n\n[truncated]"
      : text;

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed (${res.status}): ${detail}`);
  }
}
