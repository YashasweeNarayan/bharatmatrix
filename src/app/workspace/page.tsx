import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const metadata = {
  title: "Workspace — BharatMatrix",
};

export default async function WorkspacePage() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/workspace");
  }

  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <Workspace userEmail={user.email} />
    </main>
  );
}
