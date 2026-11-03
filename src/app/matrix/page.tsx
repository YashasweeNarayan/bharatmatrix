import Link from "next/link";
import MatrixTable from "@/components/MatrixTable";

export const metadata = {
  title: "Matrix — BharatMatrix",
};

export default function MatrixPage() {
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <div className="mx-auto max-w-6xl px-6 py-14 md:px-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
              Matrix
            </h1>
            <p className="mt-2 max-w-xl text-[14px] text-neutral-400">
              Each question becomes a column, each document a row. Click a
              filled cell to see the exact passage it was answered from.
            </p>
          </div>
          <Link
            href="/workspace"
            className="rounded-full border border-ink-700 px-4 py-2 text-[13px] font-medium text-neutral-300 transition-colors hover:border-ink-600 hover:text-white"
          >
            ← Workspace
          </Link>
        </div>

        <div className="mt-10">
          <MatrixTable />
        </div>
      </div>
    </main>
  );
}
