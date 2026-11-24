import { notFound } from "next/navigation";
import AdminSetupForm from "@/components/AdminSetupForm";

export const metadata = { title: "Admin setup — BharatMatrix" };
export const dynamic = "force-dynamic";

export default function AdminSetupPage() {
  // The page doesn't exist unless the deployer set ADMIN_SETUP_KEY.
  if (!process.env.ADMIN_SETUP_KEY) notFound();
  return (
    <main className="bg-grain min-h-screen bg-ink-950">
      <AdminSetupForm />
    </main>
  );
}
