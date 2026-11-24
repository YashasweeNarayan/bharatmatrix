import AppShell from "@/components/AppShell";
import AdminHistory from "@/components/AdminHistory";
import { requireAdminPage } from "@/lib/adminPage";

export const metadata = { title: "User History — BharatMatrix" };
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
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">User History</h1>
      <p className="mt-2 max-w-xl text-[14px] text-neutral-400">Every user&apos;s conversations. Answers and quoted passages are shown; file names and files are not.</p>
      <div className="mt-6">
        <AdminHistory />
      </div>
    </AppShell>
  );
}
