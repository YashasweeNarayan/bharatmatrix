import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 10;
// See the comment in /api/matrix/route.ts — same static-caching gotcha.
export const dynamic = "force-dynamic";

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
  const questions = await sql`
    select id, text, ordinal from questions
    where user_id = ${user.id}
    order by ordinal asc
  `;
  return NextResponse.json({ questions });
}

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

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "No question text provided." },
      { status: 400 },
    );
  }

  const [{ next_ordinal: nextOrdinal }] = await sql`
    select coalesce(max(ordinal), -1) + 1 as next_ordinal from questions
    where user_id = ${user.id}
  `;

  const [question] = await sql`
    insert into questions (text, ordinal, user_id)
    values (${text}, ${nextOrdinal}, ${user.id})
    returning id
  `;

  const readyDocs = await sql`
    select id from documents where status = 'ready' and user_id = ${user.id}
  `;

  if (readyDocs.length > 0) {
    await sql`
      insert into matrix_cells (document_id, question_id, status)
      select id, ${question.id}, 'pending' from documents
      where status = 'ready' and user_id = ${user.id}
      on conflict (document_id, question_id) do nothing
    `;
  }

  // Deliberately NOT computing cells here. A single request on Vercel's
  // free plan is capped around 10s no matter what `maxDuration` says, and
  // awaiting a Gemini call per ready document blew well past that — the
  // question row would get inserted but the response never came back, so
  // the client never found out and the grid never refreshed. The client
  // drives actual computation afterwards via repeated calls to
  // /api/matrix/step, one cell per call.
  return NextResponse.json({ questionId: question.id });
}
