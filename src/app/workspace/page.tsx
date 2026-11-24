import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Workspace from "@/components/Workspace";
import AppShell from "@/components/AppShell";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";
import { isUuid } from "@/lib/security";

export const metadata = {
  title: "Workspace — BharatMatrix",
};

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: { c?: string; new?: string };
}) {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/workspace");
  }
  // Admins review chats; the assistant workspace isn't theirs.
  if (user.isAdmin) redirect("/admin/history");

  const conversationId = isUuid(searchParams.c) ? searchParams.c : null;

  return (
    <AppShell
      email={user.email}
      username={user.username}
      avatarUrl={user.avatarUrl}
      isAdmin={user.isAdmin}
    >
      {/* key remounts the chat when switching threads or hitting New chat */}
      <Workspace
        key={conversationId ?? `new-${searchParams.new ?? ""}`}
        conversationId={conversationId}
      />
    </AppShell>
  );
}
