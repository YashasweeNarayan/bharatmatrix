import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
  await sql`
    delete from questions where id = ${params.id} and user_id = ${user.id}
  `;
  return NextResponse.json({ ok: true });
}
