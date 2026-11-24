import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in person's own conversations, newest first. */
export async function GET(req: NextRequest) {
  await ensureSchema();
  try {
    const user = await requireUser(req);
    const conversations = await sql`
      select id, title, channel, created_at, updated_at
      from chat_conversations
      where user_id = ${user.id}
      order by updated_at desc
      limit 200
    `;
    return NextResponse.json({ conversations });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }
}
