import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedText, answerFromContext } from "@/lib/gemini";
import { verifyGrounding } from "@/lib/verify";
import { hybridRetrieve } from "@/lib/retrieve";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
// Same reason as /api/ask: a question goes through embed -> hybrid
// retrieve -> rerank -> Analyst -> Verifier, several real network calls
// in series.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
  };
};

/**
 * Telegram calls this on every message sent to the bot (set up once via
 * Telegram's setWebhook API, not from inside this app — see the setup
 * note in the reply to the user). There is no session cookie here, no
 * CSRF protection Telegram understands, and no way to "log in" a chat —
 * the one thing standing between this endpoint and the open internet is
 * the shared secret Telegram echoes back on every call once configured
 * with secret_token.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return NextResponse.json({ error: "Bad secret" }, { status: 401 });
    }
  }

  await ensureSchema();

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text?.trim();

  // Telegram only waits ~60s for a webhook response and doesn't really
  // care what we return as long as it's a 2xx — always ack immediately
  // even for updates we don't understand (edited messages, stickers,
  // non-text content), so Telegram never retries a message we already
  // chose to ignore.
  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (text.startsWith("/start")) {
      await handleStart(chatId, text);
      return NextResponse.json({ ok: true });
    }

    await handleQuestion(chatId, text);
  } catch (err) {
    console.error("[telegram webhook]", err);
    await sendTelegramMessage(
      chatId,
      "Something went wrong answering that — please try again in a moment.",
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

async function handleStart(chatId: number, text: string): Promise<void> {
  const code = text.replace("/start", "").trim();

  if (!code) {
    await sendTelegramMessage(
      chatId,
      "👋 Welcome to BharatMatrix. To link this chat to your account, go " +
        "to your BharatMatrix workspace, open \"Connect Telegram\", and " +
        "tap the link or paste the code it gives you here as " +
        "\"/start <code>\".",
    );
    return;
  }

  const [row] = await sql`
    select user_id from telegram_link_codes
    where code = ${code} and expires_at > now()
  `;

  if (!row) {
    await sendTelegramMessage(
      chatId,
      "That code isn't valid or has expired — codes last 10 minutes. " +
        "Generate a new one from \"Connect Telegram\" in your workspace " +
        "and try again.",
    );
    return;
  }

  await sql`
    insert into telegram_links (chat_id, user_id)
    values (${String(chatId)}, ${row.user_id})
    on conflict (chat_id) do update set user_id = excluded.user_id
  `;
  await sql`delete from telegram_link_codes where code = ${code}`;

  await sendTelegramMessage(
    chatId,
    "✅ Linked! Just send me a question and I'll answer it from your " +
      "uploaded documents — only from what's actually in them, with the " +
      "exact passage it came from.",
  );
}

async function handleQuestion(chatId: number, question: string): Promise<void> {
  const [link] = await sql`
    select user_id from telegram_links where chat_id = ${String(chatId)}
  `;

  if (!link) {
    await sendTelegramMessage(
      chatId,
      "This chat isn't linked to a BharatMatrix account yet. Open " +
        "\"Connect Telegram\" in your workspace and send me the code it " +
        "gives you as \"/start <code>\".",
    );
    return;
  }

  const userId = link.user_id as string;

  const readyDocs = await sql`
    select id from documents where status = 'ready' and user_id = ${userId}
  `;
  if (readyDocs.length === 0) {
    await sendTelegramMessage(
      chatId,
      "No documents are ready to search yet — upload one in your " +
        "workspace and wait for it to show \"ready\".",
    );
    return;
  }

  const queryEmbedding = await embedText(question);
  const context = await hybridRetrieve(question, queryEmbedding, userId);

  if (context.length === 0) {
    await sendTelegramMessage(
      chatId,
      "Nothing indexed yet for the ready documents — they may still be " +
        "processing.",
    );
    return;
  }

  const analystResult = await answerFromContext(question, context);
  const result = verifyGrounding(analystResult, context);

  const filenameById = new Map(
    context.map((c) => [c.documentId, c.filename] as const),
  );

  const lines = [result.answer, ""];
  lines.push(result.grounded ? "✅ grounded" : "⚠️ not found in your documents");

  if (result.citations.length > 0) {
    lines.push("");
    for (const c of result.citations) {
      const filename = filenameById.get(c.documentId) ?? "document";
      lines.push(`[${filename} — ${c.pageLabel}]`);
      lines.push(`"${c.quote}"`);
    }
  }

  await sendTelegramMessage(chatId, lines.join("\n"));
}
