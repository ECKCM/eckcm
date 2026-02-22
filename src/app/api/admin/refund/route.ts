import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

interface RefundBody {
  paymentId: string;
  amountCents?: number; // If omitted, full refund
  reason?: string;
}

export async function POST(request: Request) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Admin check (SUPER_ADMIN or EVENT_ADMIN)
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isAdmin = assignments?.some((a) => {
    const roleName = (a.eckcm_roles as unknown as { name: string })?.name;
    return roleName === "SUPER_ADMIN" || roleName === "EVENT_ADMIN";
  });

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Only admins can issue refunds" },
      { status: 403 }
    );
  }

  // 3. Parse body
  const body: RefundBody = await request.json();
  const { paymentId, amountCents, reason } = body;

  if (!paymentId) {
    return NextResponse.json(
      { error: "Missing paymentId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 4. Load payment record
  const { data: payment } = await admin
    .from("eckcm_payments")
    .select("id, stripe_payment_intent_id, payment_method, amount_cents, status, invoice_id")
    .eq("id", paymentId)
    .single();

  if (!payment) {
    return NextResponse.json(
      { error: "Payment not found" },
      { status: 404 }
    );
  }

  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    return NextResponse.json(
      { error: `Cannot refund a payment with status: ${payment.status}` },
      { status: 400 }
    );
  }

  // 5. Determine refund amount
  const refundAmount = amountCents ?? payment.amount_cents;
  if (refundAmount <= 0 || refundAmount > payment.amount_cents) {
    return NextResponse.json(
      { error: `Invalid refund amount. Payment is $${(payment.amount_cents / 100).toFixed(2)}` },
      { status: 400 }
    );
  }

  // 6. Resolve event info for Stripe mode
  let eventId: string | null = null;
  let stripeMode: "test" | "live" = "test";

  if (payment.invoice_id) {
    const { data: inv } = await admin
      .from("eckcm_invoices")
      .select("registration_id")
      .eq("id", payment.invoice_id)
      .single();

    if (inv?.registration_id) {
      const { data: reg } = await admin
        .from("eckcm_registrations")
        .select("event_id, eckcm_events!inner(stripe_mode)")
        .eq("id", inv.registration_id)
        .single();

      if (reg) {
        eventId = reg.event_id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stripeMode = ((reg as any).eckcm_events?.stripe_mode as "test" | "live") ?? "test";
      }
    }
  }

  // 7. For Stripe payments, issue refund via Stripe API
  if (payment.stripe_payment_intent_id) {
    try {
      const stripe = await getStripeForMode(stripeMode);
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: refundAmount,
        reason: "requested_by_customer",
      });

      // The webhook will handle updating payment/invoice/registration status
      // But we still insert our own refund record for immediate tracking

      await admin.from("eckcm_refunds").insert({
        payment_id: payment.id,
        stripe_refund_id: stripeRefund.id,
        amount_cents: refundAmount,
        reason: reason || "Admin-initiated refund",
        refunded_by: user.id,
      });

      // Audit log
      await admin.from("eckcm_audit_logs").insert({
        event_id: eventId,
        user_id: user.id,
        action: "ADMIN_REFUND_INITIATED",
        entity_type: "payment",
        entity_id: payment.id,
        new_data: {
          stripe_refund_id: stripeRefund.id,
          amount_cents: refundAmount,
          reason: reason || "Admin-initiated refund",
          is_full_refund: refundAmount === payment.amount_cents,
        },
      });

      return NextResponse.json({
        success: true,
        refundId: stripeRefund.id,
        amountCents: refundAmount,
      });
    } catch (err) {
      console.error("[admin/refund] Stripe refund failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Stripe refund failed" },
        { status: 500 }
      );
    }
  }

  // 8. For non-Stripe payments (Zelle, Check, Manual), just update status directly
  const isFullRefund = refundAmount === payment.amount_cents;
  const refundStatus = isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";

  await admin.from("eckcm_refunds").insert({
    payment_id: payment.id,
    amount_cents: refundAmount,
    reason: reason || "Admin-initiated refund",
    refunded_by: user.id,
  });

  await admin
    .from("eckcm_payments")
    .update({ status: refundStatus })
    .eq("id", payment.id);

  if (payment.invoice_id) {
    await admin
      .from("eckcm_invoices")
      .update({ status: refundStatus })
      .eq("id", payment.invoice_id);

    if (isFullRefund) {
      const { data: inv } = await admin
        .from("eckcm_invoices")
        .select("registration_id")
        .eq("id", payment.invoice_id)
        .single();

      if (inv?.registration_id) {
        await admin
          .from("eckcm_registrations")
          .update({ status: "REFUNDED" })
          .eq("id", inv.registration_id);

        await admin
          .from("eckcm_epass_tokens")
          .update({ is_active: false })
          .eq("registration_id", inv.registration_id);
      }
    }
  }

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "ADMIN_REFUND_MANUAL",
    entity_type: "payment",
    entity_id: payment.id,
    new_data: {
      amount_cents: refundAmount,
      reason: reason || "Admin-initiated refund",
      is_full_refund: isFullRefund,
      payment_method: payment.payment_method,
    },
  });

  return NextResponse.json({
    success: true,
    amountCents: refundAmount,
    status: refundStatus,
  });
}
