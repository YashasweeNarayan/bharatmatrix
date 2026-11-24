import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import MatrixTable from "@/components/MatrixTable";
import AppShell from "@/components/AppShell";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const metadata = {
  title: "Matrix — BharatMatrix",
};

export default async function MatrixPage() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/matrix");
  }
  if (user.isAdmin) redirect("/admin/history");

  return (
    <AppShell email={user.email} username={user.username} avatarUrl={user.avatarUrl}
      isAdmin={user.isAdmin}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          Matrix
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-neutral-400">
          One row per document, one column per question. Open any cell to read
          the passage behind its answer.
        </p>
      </div>

      <div className="mt-8">
        <MatrixTable />
      </div>
    </AppShell>
  );
}
