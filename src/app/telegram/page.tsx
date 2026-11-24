import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TelegramConnect from "@/components/TelegramConnect";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const metadata = {
  title: "Telegram Connect — BharatMatrix",
};

export default async function TelegramPage() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/telegram");
  }
  if (user.isAdmin) redirect("/admin/history");

  return (
    <AppShell email={user.email} username={user.username} avatarUrl={user.avatarUrl}
      isAdmin={user.isAdmin}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          Telegram Connect
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-neutral-400">
          Link your Telegram account once, then ask questions from the app —
          answered the same way as here, only from your own documents.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <TelegramConnect />
      </div>
    </AppShell>
  );
}
