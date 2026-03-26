import type { SupabaseClient } from "@supabase/supabase-js";

export interface FundingSource {
  id: string;
  code: string;
  name_en: string;
  name_ko: string | null;
  amount_cents: number;
  metadata: {
    registration_group_id: string;
    sponsor_name?: string;
    sponsor_contact?: string;
  };
}

export interface FundingDiscount {
  feeCategoryId: string;
  name: string;
  nameKo: string;
  amountCents: number;
}

/**
 * Load active FUNDING fee categories that target a specific registration group.
 */
export async function loadFundingForGroup(
  supabase: SupabaseClient,
  registrationGroupId: string
): Promise<FundingSource[]> {
  const { data, error } = await supabase
    .from("eckcm_fee_categories")
    .select("id, code, name_en, name_ko, amount_cents, metadata")
    .eq("category", "FUNDING")
    .eq("is_active", true);

  if (error || !data) return [];

  // Filter by registration_group_id in metadata (JSONB)
  return data.filter(
    (f: any) => f.metadata?.registration_group_id === registrationGroupId
  );
}

/**
 * Convert funding sources to pricing-compatible discount objects.
 */
export function toFundingDiscounts(sources: FundingSource[]): FundingDiscount[] {
  return sources.map((s) => ({
    feeCategoryId: s.id,
    name: s.name_en,
    nameKo: s.name_ko || s.name_en,
    amountCents: s.amount_cents,
  }));
}

/**
 * Record funding allocations after a registration is submitted.
 */
export async function recordFundingAllocations(
  admin: SupabaseClient,
  params: {
    fundingSources: FundingSource[];
    registrationId: string;
    eventId: string;
    registrationGroupId: string;
    participantCount: number;
  }
): Promise<void> {
  if (params.fundingSources.length === 0) return;

  const inserts = params.fundingSources.map((source) => ({
    funding_fee_category_id: source.id,
    registration_id: params.registrationId,
    event_id: params.eventId,
    registration_group_id: params.registrationGroupId,
    amount_cents: source.amount_cents,
    participant_count: params.participantCount,
  }));

  await admin.from("eckcm_funding_allocations").insert(inserts);
}
