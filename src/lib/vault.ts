import { sql } from "@/lib/db";
import { adminEmails } from "@/lib/auth";
import { computeVaultStatus, type VaultStatus } from "@/lib/vaultLogic";

export function vaultRequired(): number {
  const n = Number(process.env.ADMIN_FILE_QUORUM ?? 2);
  return Number.isInteger(n) && n >= 1 ? n : 2;
}
export function vaultMinutes(): number {
  const n = Number(process.env.ADMIN_VAULT_MINUTES ?? 60);
  return Number.isFinite(n) && n >= 1 ? n : 60;
}

/** Current vault state as seen by one admin. Only approvals from people who
 *  are still admins (role + still in ADMIN_EMAILS) are counted. */
export async function getVaultStatus(adminId: string): Promise<VaultStatus> {
  const allowed = adminEmails();
  const rows = await sql`
    select a.admin_id, u.email, a.approved_at
    from admin_vault_approvals a join users u on u.id = a.admin_id
    where u.role = 'admin'
  `;
  const approvals = rows
    .filter((r) => allowed.includes((r.email as string).toLowerCase()))
    .map((r) => ({
      adminId: r.admin_id as string,
      email: r.email as string,
      approvedAt: new Date(r.approved_at as string),
    }));
  return computeVaultStatus(
    approvals,
    adminId,
    new Date(),
    vaultRequired(),
    vaultMinutes(),
  );
}

/** Press the button: approve if not approved (or lapsed), withdraw if approved. */
export async function toggleApproval(adminId: string): Promise<"approved" | "withdrawn"> {
  const before = await getVaultStatus(adminId);
  if (before.mine) {
    await sql`delete from admin_vault_approvals where admin_id = ${adminId}`;
    return "withdrawn";
  }
  await sql`
    insert into admin_vault_approvals (admin_id, approved_at)
    values (${adminId}, now())
    on conflict (admin_id) do update set approved_at = now()
  `;
  return "approved";
}
