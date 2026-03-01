import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearEmailConfigCache } from "@/lib/email/email-config";
import { clearResendCache } from "@/lib/email/resend";
import { z } from "zod";

function maskKey(key: string | null): { is_set: boolean; last4: string } {
  if (!key) return { is_set: false, last4: "" };
  return { is_set: true, last4: key.slice(-4) };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select("email_from_name, email_from_address, email_reply_to, resend_api_key")
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }

  const dbKeySet = !!data.resend_api_key;
  const envKeySet = !!process.env.RESEND_API_KEY;

  return NextResponse.json({
    email_from_name: data.email_from_name ?? "ECKCM",
    email_from_address: data.email_from_address ?? "noreply@eckcm.com",
    email_reply_to: data.email_reply_to ?? "",
    resend_api_key: maskKey(data.resend_api_key),
    resend_env_configured: envKeySet,
    resend_configured: dbKeySet || envKeySet,
  });
}

const patchSchema = z.object({
  email_from_name: z.string().min(1).max(100).optional(),
  email_from_address: z.string().email().max(255).optional(),
  email_reply_to: z.string().email().max(255).or(z.literal("")).optional(),
  resend_api_key: z.string().min(1).max(255).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Only SUPER_ADMIN can update email config" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.email_from_name !== undefined) updates.email_from_name = parsed.data.email_from_name;
  if (parsed.data.email_from_address !== undefined) updates.email_from_address = parsed.data.email_from_address;
  if (parsed.data.email_reply_to !== undefined) {
    updates.email_reply_to = parsed.data.email_reply_to || null;
  }
  if (parsed.data.resend_api_key !== undefined) {
    // Validate Resend API key format
    if (!parsed.data.resend_api_key.startsWith("re_")) {
      return NextResponse.json(
        { error: "Resend API key must start with re_" },
        { status: 400 }
      );
    }
    updates.resend_api_key = parsed.data.resend_api_key;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("eckcm_app_config")
    .update(updates)
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }

  // Clear caches
  clearEmailConfigCache();
  if (updates.resend_api_key) {
    clearResendCache();
  }

  // Audit log (mask the API key)
  const auditData: Record<string, unknown> = { ...updates };
  if (auditData.resend_api_key) {
    const key = auditData.resend_api_key as string;
    auditData.resend_api_key = `****${key.slice(-4)}`;
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: auth.user.id,
    action: "UPDATE_EMAIL_CONFIG",
    entity_type: "app_config",
    entity_id: "1",
    new_data: auditData,
  });

  // Return masked key in response
  const response: Record<string, unknown> = { success: true };
  if (updates.email_from_name) response.email_from_name = updates.email_from_name;
  if (updates.email_from_address) response.email_from_address = updates.email_from_address;
  if (updates.resend_api_key) {
    response.resend_api_key = maskKey(updates.resend_api_key as string);
  }

  return NextResponse.json(response);
}
