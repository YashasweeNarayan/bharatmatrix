import AppShell from "@/components/AppShell";
import AdminFiles from "@/components/AdminFiles";
import { requireAdminPage } from "@/lib/adminPage";

export const metadata = { title: "User files — BharatMatrix" };
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
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">User files</h1>
      <p className="mt-2 max-w-xl text-[14px] text-neutral-400">Sealed until two administrators approve with the lock button in the header.</p>
      <div className="mt-6">
        <AdminFiles />
      </div>
    </AppShell>
  );
}
