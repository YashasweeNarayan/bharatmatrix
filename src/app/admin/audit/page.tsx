import AppShell from "@/components/AppShell";
import AdminAudit from "@/components/AdminAudit";
import { requireAdminPage } from "@/lib/adminPage";

export const metadata = { title: "Audit log — BharatMatrix" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAdminPage();
  return (
    <AppShell
      email={user.email}
      username={user.username}
      avatarUrl={user.avatarUrl}
      isAdmin
    >
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-neutral-50 md:text-[2rem]">Audit log</h1>
      <p className="mt-2 max-w-xl text-[14px] text-neutral-400">What admins have viewed or changed. Read-only.</p>
      <div className="mt-6">
        <AdminAudit />
      </div>
    </AppShell>
  );
}
