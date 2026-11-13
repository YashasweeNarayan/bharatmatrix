"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthForm from "@/components/AuthForm";

function SignupInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/workspace";
  return <AuthForm mode="signup" next={next} />;
}

export default function SignupPage() {
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <Suspense fallback={null}>
        <SignupInner />
      </Suspense>
    </main>
  );
}
