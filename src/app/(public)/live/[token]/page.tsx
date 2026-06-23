import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveTokenMatches } from "@/lib/services/checkin-live";
import { LiveCountsClient } from "./live-counts-client";

// Capability URL — never index, always live.
export const metadata: Metadata = {
  title: "Live Check-in Counts",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function LiveCountsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();
  const secret = (cfg as { epass_hmac_secret?: string | null } | null)
    ?.epass_hmac_secret;

  if (!liveTokenMatches(decodeURIComponent(token), secret)) {
    notFound();
  }

  return <LiveCountsClient token={token} />;
}
