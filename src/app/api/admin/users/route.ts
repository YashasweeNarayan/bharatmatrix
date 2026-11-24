import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { adminOrResponse, audit } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everyone who has an ordinary account, with chat counts (no file data). */
export async function GET(req: NextRequest) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;

  const users = await sql`
    select u.id, u.email, u.username, u.created_at, u.last_login_at,
           (select count(*)::int from chat_conversations c where c.user_id = u.id) as conversations,
           (select count(*)::int from chat_turns t where t.user_id = u.id) as questions
    from users u
    where u.role = 'user'
    order by u.created_at desc
  `;
  await audit(g.admin, "list_users");
  return NextResponse.json({ users });
}
