import Link from "next/link";
import { KeyRound } from "lucide-react";
import { googleConfigured } from "@/lib/google";

export const metadata = { title: "Reset password — BharatMatrix" };
export const dynamic = "force-dynamic";

/**
 * There is no email service behind this app, so a reset link by email
 * isn't possible. Instead, prove you own the account by signing in with
 * Google (same verified email) and you land on Settings with the
 * "current password" requirement waived for 10 minutes.
 */
export default function ForgotPasswordPage() {
  const google = googleConfigured();
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <KeyRound className="h-6 w-6 text-saffron-500" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-neutral-50">
          Reset your password
        </h1>
        {google ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
              Sign in with the Google account that uses the same email as your
              BharatMatrix account. You&apos;ll be taken to Settings to choose
              a new password, and every other device will be signed out.
            </p>
            <a
              href={`/api/auth/google?next=${encodeURIComponent("/settings")}`}
              className="mt-6 flex items-center justify-center rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-onaccent hover:bg-saffron-400"
            >
              Continue with Google
            </a>
          </>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
            Password reset needs Google sign-in, which isn&apos;t set up on this
            site yet. Ask the site administrator to reset your account.
          </p>
        )}
        <p className="mt-6 text-[13px] text-neutral-500">
          <Link href="/login" className="text-neutral-300 hover:text-white">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
