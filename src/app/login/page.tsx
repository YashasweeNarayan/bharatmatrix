"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import AuthForm from "@/components/AuthForm";

function LoginInner() {
  const params = useSearchParams();
  return (
    <AuthForm
      mode="login"
      next={params.get("next") || "/workspace"}
      initialError={params.get("error")}
    />
  );
}

export default function LoginPage() {
  return (
    <main className="bg-grain relative min-h-screen bg-ink-950">
      <Link
        href="/admin/login"
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-ink-700 px-3.5 py-1.5 text-[12.5px] font-medium text-neutral-400 transition-colors hover:border-ink-600 hover:text-neutral-50 md:right-6 md:top-5"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Admin login
      </Link>
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
    </main>
  );
}
