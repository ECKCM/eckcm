import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import {
  ensurePaymentLinkToken,
  getExistingPaymentLink,
} from "@/lib/payment/payment-link";

/**
 * GET /api/admin/registrations/[id]/payment-link
 *
 * Returns whether a usable card-payment link already exists for this
 * registration WITHOUT creating one. Lets the admin UI show the current state
 * (Active vs none) instead of blindly re-generating.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: registrationId } = await params;

  const link = await getExistingPaymentLink(registrationId);
  // A link is only usable while the registration is still SUBMITTED.
  if (!link || link.status !== "SUBMITTED") {
    return NextResponse.json({ exists: false, url: null });
  }
  return NextResponse.json({ exists: true, url: link.url });
}

/**
 * POST /api/admin/registrations/[id]/payment-link
 *
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

  const result = await ensurePaymentLinkToken(registrationId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Only audit-log when a brand-new token was minted (not on reuse).
  if (!result.reused) {
    const admin = createAdminClient();
    await admin.from("eckcm_audit_logs").insert({
      event_id: result.eventId,
      user_id: user.id,
      action: "PAYMENT_LINK_CREATED",
      entity_type: "registration",
      entity_id: registrationId,
      new_data: { generated_by: user.id },
    });
  }

  return NextResponse.json({ url: result.url, reused: result.reused });
}
