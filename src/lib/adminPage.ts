import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken, type AuthUser } from "@/lib/auth";

/** For admin server pages: anyone who isn't a current admin goes to the
 *  admin login. (The APIs enforce this again independently.) */
export async function requireAdminPage(): Promise<AuthUser> {
  await ensureSchema();
  const user = await getUserByToken(cookies().get(SESSION_COOKIE)?.value);
  if (!user || !user.isAdmin) redirect("/admin/login");
  return user;
}
