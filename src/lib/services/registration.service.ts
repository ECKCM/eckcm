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
    .select("id, user_id, status, event_id")
    .eq("id", registrationId)
    .single();

  if (regError || !reg) {
    return { success: false, error: "Registration not found" };
  }

  if (reg.user_id !== userId) {
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
