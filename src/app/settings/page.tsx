import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SettingsPanel from "@/components/SettingsPanel";
import { sql, ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const metadata = {
  title: "Settings — BharatMatrix",
};

export default async function SettingsPage() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  if (!user) {
    redirect("/login?next=/settings");
  }

  const [account] = await sql`
    select created_at from users where id = ${user.id}
  `;
  const [{ count: documentCount }] = await sql`
    select count(*)::int as count from documents where user_id = ${user.id}
  `;
  const [telegramLink] = await sql`
    select 1 from telegram_links where user_id = ${user.id} limit 1
  `;

  return (
    <AppShell email={user.email}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          Settings
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-neutral-400">
          Your account at a glance.
        </p>
      </div>

      <div className="mt-8">
        <SettingsPanel
          email={user.email}
          createdAt={account?.created_at ?? new Date().toISOString()}
          documentCount={documentCount ?? 0}
          telegramLinked={Boolean(telegramLink)}
        />
      </div>
    </AppShell>
  );
}
