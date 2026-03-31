import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/**
 * Recalculate held/reserved counts for all inventory-tracked fee categories.
 *
 * Uses a full recalculation approach (not incremental) to guarantee correctness.
 * - LODGING_* categories: counts groups with matching lodgingType in preferences
 * - Other categories: counts participants in registrations linked to that fee category
 *
 * Status mapping:
 * - held = DRAFT, SUBMITTED (pending payment)
 * - reserved = APPROVED, PAID (confirmed)
 */
export async function recalculateInventory(
  admin: SupabaseClient
): Promise<void> {
  // 1. Get all inventory records with their fee category code
  const { data: inventoryRecords, error: invError } = await admin
    .from("eckcm_fee_category_inventory")
    .select(
      "id, fee_category_id, eckcm_fee_categories!inner(id, code)"
    );

  if (invError || !inventoryRecords?.length) {
    if (invError) {
      logger.error("[inventory] Failed to load inventory records", {
        error: String(invError),
      });
    }
    return;
  }

  // 2. Get all active registrations with groups + membership counts
  const { data: registrations, error: regError } = await admin
    .from("eckcm_registrations")
    .select(
      `
      id, status, registration_group_id,
      eckcm_groups(
        id,
        lodging_type,
        eckcm_group_memberships(person_id)
      )
    `
    )
    .in("status", ["DRAFT", "SUBMITTED", "APPROVED", "PAID"]);

  if (regError) {
    logger.error("[inventory] Failed to load registrations", {
      error: String(regError),
    });
    return;
  }

  // 3. Get all registration group → fee category links
  const { data: feeLinks } = await admin
    .from("eckcm_registration_group_fee_categories")
    .select("registration_group_id, fee_category_id");

  const groupFeeMap = new Map<string, Set<string>>();
  for (const link of feeLinks ?? []) {
    if (!groupFeeMap.has(link.registration_group_id)) {
      groupFeeMap.set(link.registration_group_id, new Set());
    }
    groupFeeMap.get(link.registration_group_id)!.add(link.fee_category_id);
  }

  // 4. Calculate held/reserved for each inventory record
  for (const inv of inventoryRecords) {
    const feeCode = (inv as any).eckcm_fee_categories.code as string;
    const feeCategoryId = inv.fee_category_id;
    let held = 0;
    let reserved = 0;

    for (const reg of registrations ?? []) {
      // Check if this registration's group includes this fee category
      const regGroupFees = groupFeeMap.get(reg.registration_group_id);
      if (!regGroupFees?.has(feeCategoryId)) continue;

      const isHeld = reg.status === "DRAFT" || reg.status === "SUBMITTED";
      const isReserved = reg.status === "APPROVED" || reg.status === "PAID";

      if (feeCode.startsWith("LODGING_")) {
        // Count groups with matching lodging type
        for (const group of (reg as any).eckcm_groups ?? []) {
          const lodgingType = group.lodging_type;
          if (lodgingType === feeCode) {
            if (isHeld) held++;
            if (isReserved) reserved++;
          }
        }
      } else {
        // Count participants
        const participantCount = ((reg as any).eckcm_groups ?? []).reduce(
          (sum: number, g: any) =>
            sum + (g.eckcm_group_memberships?.length ?? 0),
          0
        );
        if (isHeld) held += participantCount;
        if (isReserved) reserved += participantCount;
      }
    }

    // Update inventory record
    await admin
      .from("eckcm_fee_category_inventory")
      .update({ held, reserved })
      .eq("id", inv.id);
  }
}

/**
 * Non-blocking inventory recalculation. Logs errors but never throws.
 * Safe to call from any route without affecting the response.
 */
export async function recalculateInventorySafe(
  admin: SupabaseClient
): Promise<void> {
  try {
    await recalculateInventory(admin);
  } catch (err) {
    logger.error("[inventory] Recalculation failed", {
      error: String(err),
    });
  }
}
