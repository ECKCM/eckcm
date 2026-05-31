import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";

/** Absolute site origin (mirrors src/app/layout.tsx). */
function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Generate (or reuse) a secure self-service card-payment link for a SUBMITTED
 * (Zelle/Check) registration. The registrant opens the link with no login and
 * pays by card at full price. See submitted-card-payment-link.design.md.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;
  const { id: registrationId } = await params;

  const admin = createAdminClient();

  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("id, status, event_id, payment_link_token, payment_link_expires_at")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  if (registration.status !== "SUBMITTED") {
    return NextResponse.json(
      {
        error: `Card payment link is only available for SUBMITTED registrations (current: ${registration.status})`,
      },
      { status: 409 }
    );
  }

  const baseUrl = getAppOrigin();

  // Reuse an existing, non-expired token so the same link stays stable if the
  // admin clicks again (avoids invalidating a link already sent to the payer).
  const existingValid =
    registration.payment_link_token &&
    (!registration.payment_link_expires_at ||
      new Date(registration.payment_link_expires_at).getTime() > Date.now());

  if (existingValid) {
    return NextResponse.json({
      url: `${baseUrl}/pay/${registration.payment_link_token}`,
      reused: true,
    });
  }

  // Generate a fresh, unguessable token; store raw (for admin re-copy) + hash (for lookup).
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error: updateError } = await admin
    .from("eckcm_registrations")
    .update({
      payment_link_token: token,
      payment_link_token_hash: tokenHash,
      payment_link_created_at: new Date().toISOString(),
      payment_link_expires_at: null,
    })
    .eq("id", registrationId);

  if (updateError) {
    logger.error("[admin/payment-link] Failed to store token", {
      registrationId,
      error: String(updateError),
    });
    return NextResponse.json({ error: "Failed to create payment link" }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    event_id: registration.event_id,
    user_id: user.id,
    action: "PAYMENT_LINK_CREATED",
    entity_type: "registration",
    entity_id: registrationId,
    new_data: { generated_by: user.id },
  });

  return NextResponse.json({ url: `${baseUrl}/pay/${token}`, reused: false });
}
