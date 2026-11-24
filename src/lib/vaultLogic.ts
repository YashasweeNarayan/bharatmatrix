/**
 * The two-admin rule for the "User files" section, as a pure function (no
 * database, no clock of its own) so it can be unit-tested.
 *
 * Each admin presses the header button to record an approval. Files open
 * for an admin only when
 *   1. that admin has an unexpired approval of their own, AND
 *   2. at least `required` distinct admins hold unexpired approvals.
 * With two admins and required = 2, that means A presses, B presses
 * (whenever B likes, within the approval window of A's press), and then
 * both can open files. Either admin pressing again withdraws their own
 * approval, which closes the section for everyone.
 *
 * Only approvals from admins that currently count (still role 'admin' and
 * still in ADMIN_EMAILS) are passed in by the caller.
 */
export type VaultApproval = { adminId: string; email: string; approvedAt: Date };

export type VaultStatus = {
  required: number;
  minutes: number;
  approvals: number;
  approvedBy: string[];
  mine: boolean;
  unlocked: boolean;
  /** When the caller's own approval lapses, if they have one. */
  expiresAt: string | null;
};

export function computeVaultStatus(
  approvals: VaultApproval[],
  adminId: string,
  now: Date,
  required: number,
  minutes: number,
): VaultStatus {
  const windowMs = minutes * 60 * 1000;
  const active = approvals.filter(
    (a) => now.getTime() - a.approvedAt.getTime() < windowMs,
  );
  const mineRow = active.find((a) => a.adminId === adminId);
  const distinct = new Set(active.map((a) => a.adminId)).size;
  return {
    required,
    minutes,
    approvals: distinct,
    approvedBy: active.map((a) => a.email),
    mine: Boolean(mineRow),
    unlocked: Boolean(mineRow) && distinct >= required,
    expiresAt: mineRow
      ? new Date(mineRow.approvedAt.getTime() + windowMs).toISOString()
      : null,
  };
}
