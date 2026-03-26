import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Load all FUNDING fee categories
    const { data: fundingSources } = await admin
      .from("eckcm_fee_categories")
      .select("id, code, name_en, name_ko, amount_cents, is_active, metadata")
      .eq("category", "FUNDING")
      .order("sort_order");

    if (!fundingSources || fundingSources.length === 0) {
      return NextResponse.json({ sources: [], allocations: [] });
    }

    const sourceIds = fundingSources.map((s: any) => s.id);

    // Load all allocations with registration details
    const { data: allocations } = await admin
      .from("eckcm_funding_allocations")
      .select(`
        id,
        funding_fee_category_id,
        registration_id,
        event_id,
        registration_group_id,
        amount_cents,
        participant_count,
        created_at,
        eckcm_registrations!inner(
          confirmation_code,
          status,
          created_by_user_id
        )
      `)
      .in("funding_fee_category_id", sourceIds)
      .order("created_at", { ascending: false });

    // Load registration group names for display
    const groupIds = new Set<string>();
    for (const s of fundingSources) {
      const gid = (s.metadata as any)?.registration_group_id;
      if (gid) groupIds.add(gid);
    }
    for (const a of allocations ?? []) {
      if (a.registration_group_id) groupIds.add(a.registration_group_id);
    }

    const { data: groups } = await admin
      .from("eckcm_registration_groups")
      .select("id, name_en, name_ko")
      .in("id", [...groupIds]);

    const groupMap: Record<string, { name_en: string; name_ko: string | null }> = {};
    for (const g of groups ?? []) {
      groupMap[g.id] = { name_en: g.name_en, name_ko: g.name_ko };
    }

    // Load representative names for each allocation's registration
    const regIds = (allocations ?? []).map((a: any) => a.registration_id);
    let repMap: Record<string, string> = {};
    if (regIds.length > 0) {
      const { data: reps } = await admin
        .from("eckcm_group_memberships")
        .select(`
          eckcm_groups!inner(registration_id),
          eckcm_people!inner(first_name_en, last_name_en),
          role
        `)
        .in("eckcm_groups.registration_id", regIds)
        .eq("role", "REPRESENTATIVE");

      for (const r of reps ?? []) {
        const regId = (r as any).eckcm_groups?.registration_id;
        const person = (r as any).eckcm_people;
        if (regId && person) {
          repMap[regId] = `${person.first_name_en} ${person.last_name_en}`;
        }
      }
    }

    // Enrich allocations with representative name
    const enrichedAllocations = (allocations ?? []).map((a: any) => ({
      ...a,
      representative_name: repMap[a.registration_id] || "Unknown",
      group_name: groupMap[a.registration_group_id]?.name_en || "Unknown",
    }));

    // Enrich sources with group name
    const enrichedSources = fundingSources.map((s: any) => ({
      ...s,
      group_name: groupMap[(s.metadata as any)?.registration_group_id]?.name_en || "Unknown",
      group_name_ko: groupMap[(s.metadata as any)?.registration_group_id]?.name_ko || null,
    }));

    return NextResponse.json({
      sources: enrichedSources,
      allocations: enrichedAllocations,
      groupMap,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
