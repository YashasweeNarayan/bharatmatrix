import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { adminOrResponse, audit } from "@/lib/adminGuard";
import { getVaultStatus } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * User files, grouped by user. Refuses (403 + locked:true) unless the
 * two-admin rule is currently satisfied for THIS admin — checked on every
 * request on the server, so hiding the page in the UI is not the control.
 */
export async function GET(req: NextRequest) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;

  const vault = await getVaultStatus(g.admin.id);
  if (!vault.unlocked) {
    return NextResponse.json({ locked: true, vault }, { status: 403 });
  }

  const rows = await sql`
    select u.id as user_id, u.email, u.username,
           d.id as doc_id, d.filename, d.mime_type, d.status, d.page_count,
           d.created_at, d.blob_url
    from users u
    join documents d on d.user_id = u.id
    where u.role = 'user'
    order by u.email asc, d.created_at desc
  `;
  const byUser = new Map<
    string,
    { userId: string; email: string; username: string | null; files: unknown[] }
  >();
  for (const r of rows) {
    const key = r.user_id as string;
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: key,
        email: r.email as string,
        username: (r.username as string | null) ?? null,
        files: [],
      });
    }
    byUser.get(key)!.files.push({
      id: r.doc_id,
      filename: r.filename,
      mimeType: r.mime_type,
      status: r.status,
      pageCount: r.page_count,
      createdAt: r.created_at,
      url: r.blob_url,
    });
  }
  await audit(g.admin, "view_files");
  return NextResponse.json({ locked: false, vault, users: [...byUser.values()] });
}
