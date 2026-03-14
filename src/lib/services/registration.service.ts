import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch a registration with related data.
 */
export async function getRegistrationWithDetails(
  supabase: SupabaseClient,
  registrationId: string
) {
  const { data, error } = await supabase
    .from("eckcm_registrations")
    .select(
      `
      *,
      eckcm_events!inner(name_en, year, event_start_date, event_end_date),
      eckcm_groups(
        id,
        display_group_code,
        eckcm_group_memberships(
          person_id,
          role,
          eckcm_people(first_name_en, last_name_en, display_name_ko)
        )
      )
    `
    )
    .eq("id", registrationId)
    .single();

  return { data, error };
}

/**
 * Cancel a registration and update related records.
 */
export async function cancelRegistration(
  supabase: SupabaseClient,
  params: {
    registrationId: string;
    userId: string;
    reason?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const { registrationId, userId, reason } = params;

  // Verify registration exists and belongs to user
  const { data: reg, error: regError } = await supabase
    .from("eckcm_registrations")
    .select("id, created_by_user_id, status, event_id")
    .eq("id", registrationId)
    .single();

  if (regError || !reg) {
    return { success: false, error: "Registration not found" };
  }

  if (reg.created_by_user_id !== userId) {
    return { success: false, error: "Not authorized to cancel this registration" };
  }

  if (reg.status === "CANCELLED" || reg.status === "REFUNDED") {
    return { success: false, error: `Registration is already ${reg.status.toLowerCase()}` };
  }

  // Update registration status
  const { error: updateError } = await supabase
    .from("eckcm_registrations")
    .update({
      status: "CANCELLED",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
    })
    .eq("id", registrationId);

  if (updateError) {
    return { success: false, error: "Failed to cancel registration" };
  }

  // Deactivate E-Pass tokens
  await supabase
    .from("eckcm_epass_tokens")
    .update({ is_active: false })
    .eq("registration_id", registrationId);

  return { success: true };
}

/**
 * Permanently delete a DRAFT registration and all related records.
 * Only works on DRAFT status — refuses to delete SUBMITTED/PAID/etc.
 */
export async function deleteDraftRegistration(
  admin: SupabaseClient,
  registrationId: string
): Promise<void> {
  // Invoices → line items, payments
  const { data: invoices } = await admin
    .from("eckcm_invoices")
    .select("id")
    .eq("registration_id", registrationId);
  const invoiceIds = (invoices ?? []).map((i) => i.id);

  if (invoiceIds.length > 0) {
    await admin.from("eckcm_invoice_line_items").delete().in("invoice_id", invoiceIds);
    await admin.from("eckcm_payments").delete().in("invoice_id", invoiceIds);
    await admin.from("eckcm_invoices").delete().in("id", invoiceIds);
  }

  // Groups → memberships → people
  const { data: groups } = await admin
    .from("eckcm_groups")
    .select("id")
    .eq("registration_id", registrationId);
  const groupIds = (groups ?? []).map((g) => g.id);

  let personIds: string[] = [];
  if (groupIds.length > 0) {
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id")
      .in("group_id", groupIds);
    personIds = (memberships ?? []).map((m) => m.person_id);

    await admin.from("eckcm_group_memberships").delete().in("group_id", groupIds);
  }

  // Other child records
  await admin.from("eckcm_registration_rides").delete().eq("registration_id", registrationId);
  await admin.from("eckcm_epass_tokens").delete().eq("registration_id", registrationId);
  await admin.from("eckcm_groups").delete().eq("registration_id", registrationId);

  if (personIds.length > 0) {
    await admin.from("eckcm_people").delete().in("id", personIds);
  }

  // Finally delete the registration itself
  await admin.from("eckcm_registrations").delete().eq("id", registrationId);
}
