"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type Mode = "login" | "signup";

export default function AuthForm({
  mode,
  next,
}: {
  mode: Mode;
  next: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === "signup";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
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
      router.push(next);
      router.refresh();
    } catch {
      setError("Couldn't reach the server — try again.");
      setSubmitting(false);
    }
  }

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

      <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
        {isSignup ? "Create your account" : "Log in"}
      </h1>
      <p className="mt-1.5 text-[13px] text-neutral-400">
        {isSignup
          ? "Your documents and questions are private to your account."
          : "Welcome back."}
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
          <span className="text-[13px] text-neutral-400">Password</span>
          <input
            type="password"
            required
            minLength={isSignup ? 8 : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2.5 text-[14px] text-neutral-100 outline-none transition-colors focus:border-saffron-500"
            placeholder={isSignup ? "At least 8 characters" : "••••••••"}
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1.5 flex items-center justify-center gap-2 rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-ink-950 transition-colors hover:bg-saffron-400 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-[13px] text-neutral-500">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link
              href={`/login${next !== "/workspace" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-neutral-300 hover:text-white"
            >
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link
              href={`/signup${next !== "/workspace" ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-neutral-300 hover:text-white"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
