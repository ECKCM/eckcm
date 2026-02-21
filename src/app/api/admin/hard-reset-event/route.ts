import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      { error: "Only SUPER_ADMIN can perform hard reset" },
      { status: 403 }
    );
  }

  // 3. Parse body
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

  // 4. Delete in FK-safe order (deepest children first)
  // Get registration IDs for this event
  const { data: registrations } = await admin
    .from("eckcm_registrations")
    .select("id")
    .eq("event_id", eventId);

  const regIds = registrations?.map((r) => r.id) ?? [];

  // Get invoice IDs for these registrations
  let invoiceIds: string[] = [];
  if (regIds.length > 0) {
    const { data: invoices } = await admin
      .from("eckcm_invoices")
      .select("id")
      .in("registration_id", regIds);
    invoiceIds = invoices?.map((i) => i.id) ?? [];
  }

  // Get payment IDs for these invoices
  let paymentIds: string[] = [];
  if (invoiceIds.length > 0) {
    const { data: payments } = await admin
      .from("eckcm_payments")
      .select("id")
      .in("invoice_id", invoiceIds);
    paymentIds = payments?.map((p) => p.id) ?? [];
  }

  // Get group IDs for this event
  const { data: groups } = await admin
    .from("eckcm_groups")
    .select("id")
    .eq("event_id", eventId);
  const groupIds = groups?.map((g) => g.id) ?? [];

  // Get person IDs from group memberships (for orphan cleanup)
  let personIds: string[] = [];
  if (groupIds.length > 0) {
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id")
      .in("group_id", groupIds);
    personIds = memberships?.map((m) => m.person_id) ?? [];
  }

  // --- Tier 1: Leaf nodes ---

  // Refunds
  if (paymentIds.length > 0) {
    await admin.from("eckcm_refunds").delete().in("payment_id", paymentIds);
  }

  // Checkins
  await admin.from("eckcm_checkins").delete().eq("event_id", eventId);

  // E-pass tokens
  if (regIds.length > 0) {
    await admin
      .from("eckcm_epass_tokens")
      .delete()
      .in("registration_id", regIds);
  }

  // Invoice line items
  if (invoiceIds.length > 0) {
    await admin
      .from("eckcm_invoice_line_items")
      .delete()
      .in("invoice_id", invoiceIds);
  }

  // Registration selections
  if (regIds.length > 0) {
    await admin
      .from("eckcm_registration_selections")
      .delete()
      .in("registration_id", regIds);
  }

  // --- Tier 2: Parents of leaf nodes ---

  // Payments
  const deletedPayments = paymentIds.length;
  if (invoiceIds.length > 0) {
    await admin.from("eckcm_payments").delete().in("invoice_id", invoiceIds);
  }

  // Invoices
  const deletedInvoices = invoiceIds.length;
  if (regIds.length > 0) {
    await admin.from("eckcm_invoices").delete().in("registration_id", regIds);
  }

  // Group memberships
  if (groupIds.length > 0) {
    await admin
      .from("eckcm_group_memberships")
      .delete()
      .in("group_id", groupIds);
  }

  // --- Tier 2.5: Orphaned people (not linked to user accounts) ---
  if (personIds.length > 0) {
    // Find which person IDs are linked to user accounts
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

  // Groups
  await admin.from("eckcm_groups").delete().eq("event_id", eventId);

  // Registrations
  const deletedRegistrations = regIds.length;
  await admin.from("eckcm_registrations").delete().eq("event_id", eventId);

  // --- Tier 4: Event operational data ---
  await admin.from("eckcm_sessions").delete().eq("event_id", eventId);
  await admin
    .from("eckcm_registration_drafts")
    .delete()
    .eq("event_id", eventId);
  await admin.from("eckcm_notifications").delete().eq("event_id", eventId);

  // 5. Reset registration sequence counter
  await admin
    .from("eckcm_events")
    .update({ next_registration_seq: 1 })
    .eq("id", eventId);

  // 6. Audit log
  await admin.from("eckcm_audit_logs").insert({
    event_id: eventId,
    user_id: user.id,
    action: "HARD_RESET",
    entity_type: "event",
    entity_id: eventId,
    new_data: {
      deletedRegistrations,
      deletedInvoices,
      deletedPayments,
    },
  });

  return NextResponse.json({
    success: true,
    deletedRegistrations,
    deletedInvoices,
    deletedPayments,
  });
}
