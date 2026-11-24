import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { adminOrResponse, audit } from "@/lib/adminGuard";
import { isUuid } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const conv = await sql`
    select c.id, c.title, u.email
    from chat_conversations c join users u on u.id = c.user_id
    where c.id = ${params.id} and u.role = 'user'
  `;
  if (conv.length === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const rows = await sql`
    select id, question, answer, grounded, citations, created_at
    from chat_turns where conversation_id = ${params.id}
    order by created_at asc
  `;
  // Citations are reduced to page + quoted text. File names and document
  // ids are deliberately left out: files are behind the two-admin lock.
  const turns = rows.map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    grounded: r.grounded,
    created_at: r.created_at,
    citations: ((r.citations as { pageLabel?: string; quote?: string }[]) ?? []).map(
      (c) => ({ pageLabel: c.pageLabel ?? "", quote: c.quote ?? "" }),
    ),
  }));
  await audit(g.admin, "view_conversation", `${conv[0].email}:${params.id}`);
  return NextResponse.json({ conversation: conv[0], turns });
}
