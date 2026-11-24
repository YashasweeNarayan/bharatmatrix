"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthForm from "@/components/AuthForm";

function Inner() {
  const params = useSearchParams();
  return <AuthForm mode="admin" next="/admin/history" initialError={params.get("error")} />;
}

export default function AdminLoginPage() {
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </main>
  );
}
