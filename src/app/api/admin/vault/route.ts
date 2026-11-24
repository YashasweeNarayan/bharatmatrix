import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { adminOrResponse, audit } from "@/lib/adminGuard";
import { getVaultStatus, toggleApproval } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;
  return NextResponse.json({ vault: await getVaultStatus(g.admin.id) });
}

/** The header button. Toggles this admin's approval and returns new status. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const g = await adminOrResponse(req);
  if ("response" in g) return g.response;
  const result = await toggleApproval(g.admin.id);
  await audit(g.admin, result === "approved" ? "vault_approve" : "vault_withdraw");
  return NextResponse.json({ result, vault: await getVaultStatus(g.admin.id) });
}
