import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can perform hard reset" },
      { status: 403 }
    );
  }
  const { user } = auth;

  const { eventId } = await request.json();
  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify event exists
  const { data: event } = await admin
    .from("eckcm_events")
    .select("id, name_en, year")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const errors: string[] = [];

  // Helper: delete with error tracking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function safeDelete(label: string, fn: () => PromiseLike<{ error: any }>) {
    const { error } = await fn();
    if (error) {
      const msg = `${label}: ${error.message ?? JSON.stringify(error)}`;
      logger.error(`[hard-reset] ${msg}`);
      errors.push(msg);
    }
  }

  // Collect IDs for FK-safe deletion
  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("event_id", eventId);
  const regIds = registrations?.map((r) => r.id) ?? [];

  let invoiceIds: string[] = [];
  if (regIds.length > 0) {
    const { data: invoices } = await admin
      .from("eckcm_invoices")
      .select("id")
      .in("registration_id", regIds);
    invoiceIds = invoices?.map((i) => i.id) ?? [];
  }

  let paymentIds: string[] = [];
  if (invoiceIds.length > 0) {
    const { data: payments } = await admin
      .from("eckcm_payments")
      .select("id")
      .in("invoice_id", invoiceIds);
    paymentIds = payments?.map((p) => p.id) ?? [];
  }

  const { data: groups } = await admin
    .from("eckcm_groups")
    .select("id")
    .eq("event_id", eventId);
  const groupIds = groups?.map((g) => g.id) ?? [];

  let personIds: string[] = [];
  if (groupIds.length > 0) {
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id")
      .in("group_id", groupIds);
    personIds = memberships?.map((m) => m.person_id) ?? [];
  }

  // --- Tier 1: Leaf nodes ---

  if (paymentIds.length > 0) {
    await safeDelete("refunds", () =>
      admin.from("eckcm_refunds").delete().in("payment_id", paymentIds)
    );
  }

  await safeDelete("checkins", () =>
    admin.from("eckcm_checkins").delete().eq("event_id", eventId)
  );

  if (regIds.length > 0) {
    await safeDelete("epass_tokens", () =>
      admin.from("eckcm_epass_tokens").delete().in("registration_id", regIds)
    );
  }

  // Delete email logs by event_id (catches all, including those with NULL registration_id)
  await safeDelete("email_logs", () =>
    admin.from("eckcm_email_logs").delete().eq("event_id", eventId)
  );
  // Also clear any email_logs by registration_id (for logs with NULL event_id)
  if (regIds.length > 0) {
    await safeDelete("email_logs_by_reg", () =>
      admin.from("eckcm_email_logs").delete().in("registration_id", regIds)
    );
  }

  if (invoiceIds.length > 0) {
    await safeDelete("invoice_line_items", () =>
      admin.from("eckcm_invoice_line_items").delete().in("invoice_id", invoiceIds)
    );
  }

  if (regIds.length > 0) {
    await safeDelete("registration_selections", () =>
      admin.from("eckcm_registration_selections").delete().in("registration_id", regIds)
    );
  }

  // --- Tier 2: Parents of leaf nodes ---

  if (invoiceIds.length > 0) {
    await safeDelete("payments", () =>
      admin.from("eckcm_payments").delete().in("invoice_id", invoiceIds)
    );
  }

  if (regIds.length > 0) {
    await safeDelete("invoices", () =>
      admin.from("eckcm_invoices").delete().in("registration_id", regIds)
    );
  }

  if (groupIds.length > 0) {
    await safeDelete("group_memberships", () =>
      admin.from("eckcm_group_memberships").delete().in("group_id", groupIds)
    );
  }

  // --- Tier 2.5: Orphaned people ---
  if (personIds.length > 0) {
    const { data: linkedPeople } = await admin
      .from("eckcm_user_people")
      .select("person_id")
      .in("person_id", personIds);
    const linkedIds = new Set(linkedPeople?.map((lp) => lp.person_id) ?? []);
    const orphanIds = personIds.filter((id) => !linkedIds.has(id));

    if (orphanIds.length > 0) {
      await safeDelete("orphan_people", () =>
        admin.from("eckcm_people").delete().in("id", orphanIds)
      );
    }
  }

  // --- Tier 3: Core data ---

  await safeDelete("groups", () =>
    admin.from("eckcm_groups").delete().eq("event_id", eventId)
  );

  await safeDelete("registrations", () =>
    admin.from("eckcm_registrations").delete().eq("event_id", eventId)
  );

  // --- Tier 4: Event operational data ---

  await safeDelete("sessions", () =>
    admin.from("eckcm_sessions").delete().eq("event_id", eventId)
  );
  await safeDelete("registration_drafts", () =>
    admin.from("eckcm_registration_drafts").delete().eq("event_id", eventId)
  );
  await safeDelete("notifications", () =>
    admin.from("eckcm_notifications").delete().eq("event_id", eventId)
  );

  // --- Verify cleanup ---
  const { count: remainingInvoices } = await admin
    .from("eckcm_invoices")
    .select("id", { count: "exact", head: true })
    .in("registration_id", regIds.length > 0 ? regIds : ["__none__"]);

  const { count: remainingRegs } = await admin
    .from("eckcm_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);

  if ((remainingInvoices ?? 0) > 0 || (remainingRegs ?? 0) > 0) {
    logger.error(
      `[hard-reset] Incomplete cleanup: ${remainingRegs} registrations, ${remainingInvoices} invoices remaining`
    );
    errors.push(
      `Incomplete: ${remainingRegs ?? 0} registrations and ${remainingInvoices ?? 0} invoices still remain`
    );
  }

  // Reset sequence counters
  await admin
    .from("eckcm_events")
    .update({ next_registration_seq: 1 })
    .eq("id", eventId);

  await admin.rpc("reset_invoice_seq");

  // Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "HARD_RESET",
    entity_type: "event",
    entity_id: eventId,
    new_data: {
      deletedRegistrations: regIds.length,
      deletedInvoices: invoiceIds.length,
      deletedPayments: paymentIds.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  if (errors.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Hard reset completed with errors: ${errors.join("; ")}`,
        deletedRegistrations: regIds.length,
        deletedInvoices: invoiceIds.length,
        deletedPayments: paymentIds.length,
        errors,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedRegistrations: regIds.length,
    deletedInvoices: invoiceIds.length,
    deletedPayments: paymentIds.length,
  });
}
