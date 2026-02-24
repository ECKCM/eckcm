import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

export async function POST(request: Request) {
  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. SUPER_ADMIN check
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const isSuperAdmin = assignments?.some(
    (a) =>
      a.eckcm_roles &&
      (a.eckcm_roles as unknown as { name: string }).name === "SUPER_ADMIN"
  );

  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can sync Stripe" },
      { status: 403 }
    );
  }

  // 3. Parse body
  const body = await request.json();
  const { eventId } = body;

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 4. Load event to get stripe_mode
  const { data: event } = await admin
    .from("eckcm_events")
    .select("id, name_en, stripe_mode, payment_test_mode")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const stripeMode = (event.stripe_mode as "test" | "live") ?? "test";
  const stripe = await getStripeForMode(stripeMode);

  // 5. Get all invoices for this event that are SUCCEEDED but have no payment record
  const { data: invoices } = await admin
    .from("eckcm_invoices")
    .select(`
      id,
      invoice_number,
      total_cents,
      status,
      registration_id,
      eckcm_registrations!inner(event_id),
      eckcm_payments(id)
    `)
    .eq("eckcm_registrations.event_id", eventId);

  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ message: "No invoices found", synced: 0 });
  }

  // Find invoices with no payment records
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orphanInvoices = invoices.filter((inv: any) => {
    const payments = inv.eckcm_payments;
    return (!payments || payments.length === 0) && inv.status === "SUCCEEDED";
  });

  if (orphanInvoices.length === 0) {
    return NextResponse.json({ message: "All invoices have payment records", synced: 0 });
  }

  // 6. Search Stripe for PaymentIntents matching these invoices
  const results: Array<{
    invoiceNumber: string;
    invoiceId: string;
    action: string;
    stripePaymentIntentId?: string;
  }> = [];

  for (const inv of orphanInvoices) {
    try {
      // Search by metadata.invoiceId
      const paymentIntents = await stripe.paymentIntents.search({
        query: `metadata["invoiceId"]:"${inv.id}"`,
        limit: 5,
      });

      const succeededPI = paymentIntents.data.find(
        (pi) => pi.status === "succeeded"
      );

      if (succeededPI) {
        // Determine payment method
        const pmType = succeededPI.payment_method_types?.[0] ?? "card";
        let method = "CARD";
        if (pmType === "us_bank_account") method = "ACH";
        else if (pmType === "klarna") method = "KLARNA";
        else if (pmType === "amazon_pay") method = "AMAZON_PAY";

        // Create missing payment record
        const { error: insertErr } = await admin.from("eckcm_payments").insert({
          invoice_id: inv.id,
          stripe_payment_intent_id: succeededPI.id,
          payment_method: method,
          amount_cents: succeededPI.amount,
          status: "SUCCEEDED",
          metadata: {
            stripe_payment_method: succeededPI.payment_method,
            stripe_charge_id:
              typeof succeededPI.latest_charge === "string"
                ? succeededPI.latest_charge
                : null,
            synced_from_stripe: true,
            synced_at: new Date().toISOString(),
          },
        });

        if (insertErr) {
          results.push({
            invoiceNumber: inv.invoice_number,
            invoiceId: inv.id,
            action: `ERROR: ${insertErr.message}`,
          });
        } else {
          results.push({
            invoiceNumber: inv.invoice_number,
            invoiceId: inv.id,
            action: "SYNCED",
            stripePaymentIntentId: succeededPI.id,
          });
        }
      } else {
        // Check if there's any PI at all
        const anyPI = paymentIntents.data[0];
        results.push({
          invoiceNumber: inv.invoice_number,
          invoiceId: inv.id,
          action: anyPI
            ? `SKIPPED: PI found but status is ${anyPI.status}`
            : "SKIPPED: No PaymentIntent found in Stripe",
          stripePaymentIntentId: anyPI?.id,
        });
      }
    } catch (err) {
      results.push({
        invoiceNumber: inv.invoice_number,
        invoiceId: inv.id,
        action: `ERROR: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
    }
  }

  const synced = results.filter((r) => r.action === "SYNCED").length;

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "STRIPE_SYNC",
    entity_type: "event",
    entity_id: eventId,
    new_data: {
      stripe_mode: stripeMode,
      total_orphan_invoices: orphanInvoices.length,
      synced,
      results,
    },
  });

  return NextResponse.json({
    message: `Synced ${synced} of ${orphanInvoices.length} orphan invoices`,
    synced,
    total: orphanInvoices.length,
    results,
  });
}
