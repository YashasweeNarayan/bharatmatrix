"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck } from "lucide-react";
import { safeNextPath } from "@/lib/safeNext";

type Mode = "login" | "signup" | "admin";

const ERRORS: Record<string, string> = {
  google_failed: "Google sign-in didn't complete. Please try again.",
  google_off: "Google sign-in isn't set up on this site.",
  not_admin: "That Google account isn't an authorised admin.",
  use_admin: "That account signs in through Admin login.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.3-1.9-6.1-4.5H2.3v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.3a11 11 0 0 0 0 9.8l3.6-2.8z" />
      <path fill="#EA4335" d="M12 5.400c1.600 0 3 .6 4.200 1.600l3.100-3.100A11 11 0 0 0 2.300 7.1l3.6 2.8C6.7 7.3 9.200 5.400 12 5.400z" />
    </svg>
  );
}

export default function AuthForm({
  mode,
  next,
  initialError,
}: {
  mode: Mode;
  next: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ? (ERRORS[initialError] ?? "Something went wrong.") : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  const isSignup = mode === "signup";
  const isAdmin = mode === "admin";
  const dest = safeNextPath(next);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setGoogleOn(Boolean(d?.google)))
      .catch(() => setGoogleOn(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const url = isAdmin ? "/api/admin/login" : `/api/auth/${mode}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push(isAdmin ? "/admin/history" : dest);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — try again.");
      setSubmitting(false);
    }
  }

  const googleHref = isAdmin
    ? "/api/auth/google?mode=admin"
    : `/api/auth/google?next=${encodeURIComponent(dest)}`;
  const q = dest !== "/workspace" ? `?next=${encodeURIComponent(dest)}` : "";

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Link
        href="/"
        className="mb-8 flex w-fit items-center gap-2.5 text-[15px] font-semibold tracking-tight text-neutral-100"
      >
        <span className="grid h-6 w-6 grid-cols-2 grid-rows-2 gap-[2px]">
          <span className="rounded-[2px] bg-saffron-500" />
          <span className="rounded-[2px] bg-matrix-500" />
          <span className="rounded-[2px] bg-matrix-500" />
          <span className="rounded-[2px] bg-saffron-500" />
        </span>
        BharatMatrix
      </Link>

      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-neutral-50">
        {isAdmin && <ShieldCheck className="h-5 w-5 text-saffron-500" />}
        {isAdmin ? "Admin login" : isSignup ? "Create your account" : "Log in"}
      </h1>
      <p className="mt-1.5 text-[13px] text-neutral-400">
        {isAdmin
          ? "For authorised administrators only. Sessions last 8 hours and every sign-in is logged."
          : isSignup
            ? "Create your workspace. Your documents and questions stay private to you."
            : "Sign in to your workspace."}
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-neutral-400">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-[14px] text-neutral-100 outline-none transition-colors focus:border-saffron-500"
            placeholder="you@company.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-[13px] text-neutral-400">
            Password
            {!isSignup && !isAdmin && (
              <Link
                href="/forgot-password"
                className="text-[12px] text-neutral-500 hover:text-saffron-400"
              >
                Forgot password?
              </Link>
            )}
          </span>
          <input
            type="password"
            required
            minLength={isSignup ? 10 : undefined}
            maxLength={72}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-[14px] text-neutral-100 outline-none transition-colors focus:border-saffron-500"
            placeholder={isSignup ? "At least 10 characters" : "••••••••"}
          />
          {isSignup && (
            <span className="text-[12px] text-neutral-600">
              Use letters and numbers. Avoid common passwords.
            </span>
          )}
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1.5 flex items-center justify-center gap-2 rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-onaccent transition-colors hover:bg-saffron-400 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isAdmin ? "Log in as admin" : isSignup ? "Sign up" : "Log in"}
        </button>

        {googleOn && (
          <>
            <div className="flex items-center gap-3 text-[12px] text-neutral-600">
              <span className="h-px flex-1 bg-ink-700" />
              or
              <span className="h-px flex-1 bg-ink-700" />
            </div>
            <a
              href={googleHref}
              className="flex items-center justify-center gap-2.5 rounded-full border border-ink-700 bg-ink-900 px-5 py-2.5 text-[13px] font-medium text-neutral-200 transition-colors hover:border-neutral-500"
            >
              <GoogleIcon />
              Continue with Google
            </a>
          </>
        )}
      </form>

      {isSignup && (
        <p className="mt-5 text-[12px] leading-relaxed text-neutral-600">
          Platform administrators can read the questions you ask and the
          answers you receive, to support and improve the service. They
          cannot open your uploaded files without a two-person approval.
        </p>
      )}

      {!isAdmin && (
        <p className="mt-6 text-[13px] text-neutral-500">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href={`/login${q}`} className="text-neutral-300 hover:text-white">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href={`/signup${q}`} className="text-neutral-300 hover:text-white">
                Create an account
              </Link>
            </>
          )}
        </p>
      )}
      {isAdmin && (
        <p className="mt-6 text-[13px] text-neutral-500">
          Not an admin?{" "}
          <Link href="/login" className="text-neutral-300 hover:text-white">
            Back to login
          </Link>
        </p>
      )}
    </div>
  );
}
