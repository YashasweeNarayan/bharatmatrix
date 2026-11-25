import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import DocumentsPanel from "@/components/DocumentsPanel";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const metadata = {
  title: "Documents — BharatMatrix",
};

export default async function DocumentsPage() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/documents");
  }
  if (user.isAdmin) redirect("/admin/history");

  return (
    <AppShell email={user.email} username={user.username} avatarUrl={user.avatarUrl}
      isAdmin={user.isAdmin}
    >
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-neutral-50 md:text-[2rem]">
          Documents
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-neutral-400">
          Everything you&apos;ve uploaded — annual reports, investor decks,
          audit reports. BharatMatrix reads each one page by page so every
          answer can point back to exactly where it came from.
        </p>
      </div>

      <div className="mt-8">
        <DocumentsPanel />
      </div>
    </AppShell>
  );
}
