import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateUpjExportZip,
  upjTokenMatches,
} from "@/lib/services/upj-lodging";

export const dynamic = "force-dynamic";

/**
 * GET /api/upj-lodging/[token]/export
 * Same UPJ Excel ZIP as the admin export, but gated by the capability token
 * (no admin login) so off-site UPJ staff can download it from the staff page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const admin = createAdminClient();

  const { data: appConfig } = await admin
    .from("eckcm_app_config")
    .select("epass_hmac_secret")
    .eq("id", 1)
    .single();

  const secret = (appConfig as { epass_hmac_secret?: string | null } | null)
    ?.epass_hmac_secret;

  if (!upjTokenMatches(decodeURIComponent(token), secret)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const zipBuffer = await generateUpjExportZip(admin);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="UPJ-Lodging-Export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
