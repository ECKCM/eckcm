import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { ScanSessionDetailClient } from "./scan-session-detail-client";

export default async function ScanSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    notFound();
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("eckcm_scan_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (!session) notFound();

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">
          Scan Session: {session.label ?? session.kind}
        </h1>
      </div>
      <div className="p-6">
        <ScanSessionDetailClient initialSession={session} />
      </div>
    </div>
  );
}
