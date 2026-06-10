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

    // Custom (manually-recorded) funding entries — standalone amounts an admin
    // tracks by hand, separate from the per-registration allocations below.
    const { data: manualFunding } = await admin
      .from("eckcm_manual_funding")
      .select("id, event_id, name, amount_cents, sponsor_name, note, created_at, updated_at")
      .order("created_at", { ascending: false });

    // Load all FUNDING fee categories
    const { data: fundingSources } = await admin
      .from("eckcm_fee_categories")
      .select("id, code, name_en, name_ko, amount_cents, is_active, metadata")
      .eq("category", "FUNDING")
      .order("sort_order");

    if (!fundingSources || fundingSources.length === 0) {
      return NextResponse.json({
        sources: [],
        allocations: [],
        manualFunding: manualFunding ?? [],
      });
    }

    const sourceIds = fundingSources.map((s: any) => s.id);

    // Load all allocations with registration details.
    // Only count active commitments: SUBMITTED (pending payment), APPROVED ($0 confirmed), PAID.
    // Exclude DRAFT (re-opened from CANCELLED — stale rows), CANCELLED, REFUNDED.
    // Allocations are inserted on submit and not deleted on cancel/refund/reopen,
    // so we filter by registration status here rather than relying on row cleanup.
    const ACTIVE_FUNDING_STATUSES = ["SUBMITTED", "APPROVED", "PAID"];
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
      .in("eckcm_registrations.status", ACTIVE_FUNDING_STATUSES)
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
      manualFunding: manualFunding ?? [],
      groupMap,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/funding
 * Record a custom (manual) funding entry — a tracked name + amount (+ optional
 * sponsor / note). Independent of the per-registration funding allocations.
 * Body: { name, amount_cents, sponsor_name?, note?, event_id? }
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json();
  const { name, amount_cents, sponsor_name, note, event_id } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Funding name is required" }, { status: 400 });
  }
  if (typeof amount_cents !== "number" || amount_cents <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("eckcm_manual_funding")
    .insert({
      name: name.trim(),
      amount_cents,
      sponsor_name: sponsor_name?.trim() || null,
      note: note?.trim() || null,
      event_id: event_id || null,
      recorded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "MANUAL_FUNDING_CREATE",
    entity_type: "manual_funding",
    entity_id: data.id,
    new_data: { name: data.name, amount_cents, sponsor_name: data.sponsor_name },
  });

  return NextResponse.json({ funding: data });
}

/**
 * DELETE /api/admin/funding
 * Remove a custom funding entry.
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: old } = await admin
    .from("eckcm_manual_funding")
    .select("*")
    .eq("id", id)
    .single();

  if (!old) {
    return NextResponse.json({ error: "Funding entry not found" }, { status: 404 });
  }

  const { error } = await admin.from("eckcm_manual_funding").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "MANUAL_FUNDING_DELETE",
    entity_type: "manual_funding",
    entity_id: id,
    old_data: old,
  });

  return NextResponse.json({ success: true });
}
