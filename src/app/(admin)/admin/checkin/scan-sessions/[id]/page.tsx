import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCheckinStaff } from "@/lib/auth/admin";
import { CheckinBackButton } from "@/components/checkin/back-button";
import { ScanSessionDetailClient } from "./scan-session-detail-client";

export default async function ScanSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const adminAuth = await requireCheckinStaff();
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

  const isEnded = session.status === "ENDED";

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <CheckinBackButton href="/admin/checkin/scan-sessions" />
        <h1 className="text-lg font-semibold">
          {isEnded ? "Session Summary" : "Scan Session"}:{" "}
          {session.label ?? session.kind}
        </h1>
      </div>
      <div className="p-6">
        <ScanSessionDetailClient initialSession={session} />
      </div>
    </div>
  );
}
