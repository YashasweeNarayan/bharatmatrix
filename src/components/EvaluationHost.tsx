"use client";

import { useRouter } from "next/navigation";
import EvaluationPanel from "@/components/EvaluationPanel";

/**
 * EvaluationPanel was built as a modal (fixed inset-0 overlay + onClose),
 * but nothing in the app ever opened it — there was no button anywhere
 * that rendered it. Rather than bolt a trigger button onto another page,
 * it gets its own route (/evaluation, in the main nav) and this thin
 * wrapper just points "close" back at the workspace.
 */
export default function EvaluationHost() {
  const router = useRouter();
  return <EvaluationPanel onClose={() => router.push("/workspace")} />;
}
