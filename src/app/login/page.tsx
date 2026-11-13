"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthForm from "@/components/AuthForm";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/workspace";
  return <AuthForm mode="login" next={next} />;
}

export default function LoginPage() {
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
    </main>
  );
}
