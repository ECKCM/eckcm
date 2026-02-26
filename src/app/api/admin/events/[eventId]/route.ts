import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth/admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;

  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can delete events" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  // 3. Verify event exists and is not default
  const { data: event } = await admin
    .from("eckcm_events")
    .select("id, name_en, year, is_default")
    .eq("id", eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.is_default) {
    return NextResponse.json(
      { error: "Cannot delete the default event. Set another event as default first." },
      { status: 400 },
    );
  }

  // 4. Cascade delete in FK-safe order (deepest children first)
  // Same pattern as hard-reset-event, but also deletes the event itself

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
    await admin.from("eckcm_refunds").delete().in("payment_id", paymentIds);
  }
  await admin.from("eckcm_checkins").delete().eq("event_id", eventId);
  if (regIds.length > 0) {
    await admin.from("eckcm_epass_tokens").delete().in("registration_id", regIds);
  }
  if (invoiceIds.length > 0) {
    await admin.from("eckcm_invoice_line_items").delete().in("invoice_id", invoiceIds);
  }
  if (regIds.length > 0) {
    await admin.from("eckcm_registration_selections").delete().in("registration_id", regIds);
  }

  // --- Tier 2: Parents of leaf nodes ---
  if (invoiceIds.length > 0) {
    await admin.from("eckcm_payments").delete().in("invoice_id", invoiceIds);
  }
  if (regIds.length > 0) {
    await admin.from("eckcm_invoices").delete().in("registration_id", regIds);
  }
  if (groupIds.length > 0) {
    await admin.from("eckcm_group_memberships").delete().in("group_id", groupIds);
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
      await admin.from("eckcm_people").delete().in("id", orphanIds);
    }
  }

  // --- Tier 3: Core data ---
  await admin.from("eckcm_groups").delete().eq("event_id", eventId);
  await admin.from("eckcm_registrations").delete().eq("event_id", eventId);

  // --- Tier 4: Event operational data ---
  await admin.from("eckcm_airport_rides").delete().eq("event_id", eventId);
  await admin.from("eckcm_sessions").delete().eq("event_id", eventId);
  await admin.from("eckcm_registration_drafts").delete().eq("event_id", eventId);
  await admin.from("eckcm_notifications").delete().eq("event_id", eventId);

  // --- Tier 5: Audit logs referencing this event ---
  await admin.from("eckcm_audit_logs").delete().eq("event_id", eventId);

  // --- Tier 6: App config referencing this event ---
  await admin.from("eckcm_app_config").delete().eq("event_id", eventId);

  // --- Tier 7: Delete the event itself ---
  const { error: deleteError } = await admin
    .from("eckcm_events")
    .delete()
    .eq("id", eventId);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete event: ${deleteError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    deleted: {
      registrations: regIds.length,
      invoices: invoiceIds.length,
      payments: paymentIds.length,
    },
  });
}
