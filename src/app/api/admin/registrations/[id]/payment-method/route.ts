import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { writeAuditLog } from "@/lib/services/audit.service";
import {
  EDITABLE_PAYMENT_METHODS,
  isManualPaymentMethod,
} from "@/lib/payment/methods";

const EDITABLE_VALUES = EDITABLE_PAYMENT_METHODS.map((m) => m.value) as string[];

/**
 * PATCH /api/admin/registrations/[id]/payment-method
 *
 * Re-label the payment method of a manual (non-card) payment — e.g. to correct
 * Zelle → Check, or to record that an on-site payment was made by cash.
 *
 * This is a label-only correction: it does NOT touch payment status, the
 * registration status, Stripe, or emails. Card payments are intentionally
 * blocked on both sides (current and target) — card is settled through Stripe
 * and must never be set manually.
 *
 * Body: { payment_method: "ZELLE" | "CHECK" | "MANUAL" | "ONSITE" | "ONSITE_CASH" | "ONSITE_CHECK" | "ONSITE_ZELLE" }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: registrationId } = await params;
  const { payment_method: newMethod } = await request.json();

  if (!newMethod || !EDITABLE_VALUES.includes(newMethod)) {
    return NextResponse.json(
      { error: `Invalid payment method. Must be one of: ${EDITABLE_VALUES.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: reg } = await supabase
    .from("eckcm_registrations")
    .select("id, event_id, eckcm_invoices(id, status, issued_at, eckcm_payments(id, payment_method, status))")
    .eq("id", registrationId)
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = [...((reg as any).eckcm_invoices ?? [])].sort(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any) => new Date(a.issued_at ?? 0).getTime() - new Date(b.issued_at ?? 0).getTime()
  );
  // Match the registration detail card's payment selection: prefer the OUTSTANDING
  // invoice that carries a manual payment (a folded-in or separate Custom Charge —
  // the live amount-due payment), falling back to the oldest invoice for fully-paid
  // / single-invoice regs. Without this the changer edited the oldest invoice's
  // payment while the card showed the outstanding one, so the method "didn't change".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manualOutstanding = invoices.find(
    (inv: any) =>
      !["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(inv.status) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (inv.eckcm_payments ?? []).some((p: any) =>
        isManualPaymentMethod((p.payment_method ?? "").toUpperCase())
      )
  );
  const invoice = manualOutstanding ?? invoices[0];
  if (!invoice) {
    return NextResponse.json({ error: "No invoice found for this registration" }, { status: 404 });
  }

  // Within the chosen invoice, target the manual payment (the one this changer
  // governs), not whatever happens to be first.
  const payments = invoice.eckcm_payments ?? [];
  const payment =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments.find((p: any) => isManualPaymentMethod((p.payment_method ?? "").toUpperCase())) ??
    payments[0];
  if (!payment) {
    return NextResponse.json({ error: "No payment found for this registration" }, { status: 404 });
  }

  // Card payments are settled through Stripe — never allow re-labelling them.
  const currentMethod = (payment.payment_method ?? "").toUpperCase();
  if (!isManualPaymentMethod(currentMethod)) {
    return NextResponse.json(
      { error: "Card payments cannot have their method changed manually." },
      { status: 400 }
    );
  }

  if (currentMethod === newMethod) {
    return NextResponse.json({ success: true, previous_method: currentMethod, new_method: newMethod });
  }

  await supabase
    .from("eckcm_payments")
    .update({ payment_method: newMethod })
    .eq("id", payment.id);

  await writeAuditLog(supabase, {
    event_id: reg.event_id,
    user_id: auth.user.id,
    action: "ADMIN_PAYMENT_METHOD_CHANGED",
    entity_type: "payment",
    entity_id: payment.id,
    new_data: {
      registration_id: registrationId,
      previous_method: currentMethod,
      new_method: newMethod,
    },
  });

  return NextResponse.json({ success: true, previous_method: currentMethod, new_method: newMethod });
}
