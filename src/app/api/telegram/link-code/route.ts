import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to switch
// apps and paste it in, short enough that a leaked code (chat history,
// screenshot) isn't a standing risk.

/**
 * Mints a one-time code the user pastes into Telegram as "/start <code>".
 * This is the only point in the whole flow where we know for certain
 * which BharatMatrix user is asking — because it's a normal authenticated
 * request, behind the same cookie-based session as every other API route
 * here — so the webhook route (which gets no cookie at all from Telegram)
 * just has to trust whichever user_id this code was minted for.
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  if (user.role === "admin") {
    return NextResponse.json(
      { error: "Admin accounts can't use the assistant." },
      { status: 403 },
    );
  }

  // 6 bytes of randomness as 8 base32-ish characters is plenty for a
  // code that's only ever valid for 10 minutes and single-use.
  const code = randomBytes(6).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await sql`
    insert into telegram_link_codes (code, user_id, expires_at)
    values (${code}, ${user.id}, ${expiresAt})
  `;

  // Opportunistic cleanup of old codes — not load-bearing (expired codes
  // are also rejected on read in the webhook), just keeps the table small.
  await sql`delete from telegram_link_codes where expires_at < now()`;

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || null;

  return NextResponse.json({
    code,
    expiresAt: expiresAt.toISOString(),
    botUsername,
    deepLink: botUsername
      ? `https://t.me/${botUsername}?start=${code}`
      : null,
  });
}

export async function GET(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  const links = await sql`
    select chat_id, created_at from telegram_links where user_id = ${user.id}
  `;

  return NextResponse.json({ linked: links.length > 0, links });
}

export async function DELETE(req: NextRequest) {
  await ensureSchema();
  let user;
  try {
    user = await requireUser(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }

  await sql`delete from telegram_links where user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
