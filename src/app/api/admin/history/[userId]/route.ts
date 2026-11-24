import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { adminOrResponse, audit } from "@/lib/adminGuard";
import { isUuid } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;
  if (!isUuid(params.userId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // role = 'user' only: one admin can never read another admin's data.
  const who = await sql`
    select id, email, username from users
    where id = ${params.userId} and role = 'user'
  `;
  if (who.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const conversations = await sql`
    select c.id, c.title, c.channel, c.created_at, c.updated_at,
           (select count(*)::int from chat_turns t where t.conversation_id = c.id) as turns
    from chat_conversations c
    where c.user_id = ${params.userId}
    order by c.updated_at desc
    limit 500
  `;
  await audit(g.admin, "view_user_history", who[0].email as string);
  return NextResponse.json({ user: who[0], conversations });
}
