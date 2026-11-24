import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { isUuid, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  await ensureSchema();
  try {
    const user = await requireUser(req);
    if (!isUuid(params.id)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const conv = await sql`
      select id, title from chat_conversations
      where id = ${params.id} and user_id = ${user.id}
    `;
    if (conv.length === 0) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const turns = await sql`
      select id, question, answer, grounded, citations, created_at
      from chat_turns where conversation_id = ${params.id}
      order by created_at asc
    `;
    return NextResponse.json({ conversation: conv[0], turns });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  }
  await ensureSchema();
  try {
    const user = await requireUser(req);
    if (!isUuid(params.id)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    await sql`
      delete from chat_conversations
      where id = ${params.id} and user_id = ${user.id}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    throw err;
  }
}
