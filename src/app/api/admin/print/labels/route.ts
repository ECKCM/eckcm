import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractSeqFromConfirmationCode } from "@/lib/services/invoice.service";
import { isWillowLodging } from "@/lib/print/registration-summary";
import { chunkedIn } from "@/lib/supabase/chunked-in";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/admin/print/labels?eventId=xxx&status=PAID
 *
 * Returns one compact record per registration for the Avery 8160 registration
 * label sheet (30 per Letter page) — these labels are stuck on each
 * registration's check-in envelope. Each label is anchored by the registration's
 * confirmation code and carries the facts a check-in desk needs: representative
 * last name + church, total key count, total occupancy, and the assigned room
 * number(s).
 *
 * One label = one registration. Multi-room registrations sum their keys and
 * occupancy and join their room numbers (matching the registration summary
 * page's room/key aggregation). DRAFT and CANCELLED are excluded by default.
 */
export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  const status = req.nextUrl.searchParams.get("status");

  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Registrations (id + code + status only) ──
  let regQuery = admin
    .from("eckcm_registrations")
    .select(
      `id, confirmation_code, status,
       eckcm_invoices(status, issued_at, eckcm_payments(payment_method, status))`
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (status && status !== "ALL") {
    regQuery = regQuery.eq("status", status);
  } else {
    regQuery = regQuery.not("status", "in", '("DRAFT","CANCELLED")');
  }

  const { data: registrations, error: regError } = await regQuery;
  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }
  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ labels: [] });
  }

  const regIds = registrations.map((r) => r.id);

  // ── Bulk-load room groups + memberships keyed by registration (chunked) ──
  const [groupsResult, membershipsResult] = await Promise.all([
    // Room groups: lodging type (Willow detection), key count, room assignment.
    chunkedIn(
      admin,
      "eckcm_groups",
      `registration_id, lodging_type, key_count, eckcm_room_assignments(eckcm_rooms(room_number))`,
      "registration_id",
      regIds
    ),
    // Participants (one row per group membership) → occupancy + rep name/church.
    chunkedIn(
      admin,
      "eckcm_group_memberships",
      `id, role, eckcm_people!inner(first_name_en, last_name_en, display_name_ko, church_other, eckcm_churches(name_en)), eckcm_groups!inner(registration_id)`,
      "eckcm_groups.registration_id",
      regIds
    ),
  ]);

  // Surface (don't swallow) embed/query failures — these would otherwise yield
  // labels with silently-missing room/key/name data.
  if (groupsResult.error) {
    console.error("[print/labels] groups query failed:", groupsResult.error.message);
  }
  if (membershipsResult.error) {
    console.error("[print/labels] memberships query failed:", membershipsResult.error.message);
  }

  // Groups by registration.
  const groupsByReg = new Map<string, any[]>();
  for (const g of (groupsResult.data ?? []) as any[]) {
    if (!groupsByReg.has(g.registration_id)) groupsByReg.set(g.registration_id, []);
    groupsByReg.get(g.registration_id)!.push(g);
  }

  // Memberships by registration.
  const membershipsByReg = new Map<string, any[]>();
  const membershipIds: string[] = [];
  for (const m of (membershipsResult.data ?? []) as any[]) {
    const rid = m.eckcm_groups?.registration_id;
    if (!rid) continue;
    membershipIds.push(m.id);
    if (!membershipsByReg.has(rid)) membershipsByReg.set(rid, []);
    membershipsByReg.get(rid)!.push(m);
  }

  // Willow Hall participant-level room assignments (keyed by membership).
  // membershipIds is even larger than regIds, so this is chunked too.
  const willowRoomByMembership = new Map<string, string>();
  const willowResult = await chunkedIn(
    admin,
    "eckcm_willow_assignments",
    "membership_id, eckcm_rooms(room_number)",
    "membership_id",
    membershipIds
  );
  if (willowResult.error) {
    console.error("[print/labels] willow query failed:", willowResult.error.message);
  }
  for (const w of willowResult.data as any[]) {
    const roomNumber = w.eckcm_rooms?.room_number;
    if (w.membership_id && roomNumber) {
      willowRoomByMembership.set(w.membership_id, roomNumber);
    }
  }

  // "No Home Church" is a placeholder selection, not a real church — omit it.
  const normalizeChurch = (raw: string | null): string | null =>
    raw && raw.replace(/\W/g, "").toLowerCase() === "nohomechurch" ? null : raw;

  // ── Shape one label record per registration ──
  const labels = registrations.map((reg: any) => {
    const groups = groupsByReg.get(reg.id) ?? [];
    const memberships = membershipsByReg.get(reg.id) ?? [];

    // Representative anchors the last name + church; fall back to first member.
    const rep =
      memberships.find((m) => m.role === "REPRESENTATIVE") ?? memberships[0] ?? null;
    const repPerson = rep?.eckcm_people ?? null;
    const lastName =
      (repPerson?.last_name_en as string | null)?.trim() ||
      (repPerson?.display_name_ko as string | null)?.trim() ||
      (repPerson?.first_name_en as string | null)?.trim() ||
      "—";
    const church = normalizeChurch(
      repPerson?.church_other || repPerson?.eckcm_churches?.name_en || null
    );

    // Keys: sum normal lodging key counts; Willow keys are handed out separately.
    let keyCount = 0;
    let hasWillowKey = false;
    const roomSet = new Set<string>();
    for (const g of groups) {
      if (isWillowLodging(g.lodging_type)) {
        hasWillowKey = true;
      } else {
        keyCount += g.key_count ?? 0;
      }
      const raRaw = g.eckcm_room_assignments;
      const ra = Array.isArray(raRaw) ? raRaw[0] : raRaw;
      const rn = ra?.eckcm_rooms?.room_number;
      if (rn) roomSet.add(rn);
    }

    // Willow per-person rooms.
    for (const m of memberships) {
      const willowRoom = willowRoomByMembership.get(m.id);
      if (willowRoom) roomSet.add(willowRoom);
    }

    // Payment method (drives the label's status dot) — mirror the registrations
    // table: oldest invoice, or the outstanding one for SUBMITTED regs, then its
    // SUCCEEDED payment (else first). On-site regs carry an ONSITE* payment row
    // from submission, so they're flagged even before they pay at the venue.
    const invoices = [...(reg.eckcm_invoices ?? [])].sort(
      (a: any, b: any) =>
        new Date(a.issued_at ?? 0).getTime() - new Date(b.issued_at ?? 0).getTime()
    );
    const outstandingInvoice = invoices.find(
      (inv: any) =>
        !["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(inv.status) &&
        (inv.eckcm_payments ?? []).length > 0
    );
    const invoice =
      reg.status === "SUBMITTED" && outstandingInvoice
        ? outstandingInvoice
        : invoices[0];
    const payments = invoice?.eckcm_payments ?? [];
    const repPayment =
      payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0] ?? null;
    const isOnSite = (repPayment?.payment_method ?? "")
      .toUpperCase()
      .startsWith("ONSITE");

    return {
      id: reg.id,
      confirmationCode: reg.confirmation_code as string | null,
      seqNumber: extractSeqFromConfirmationCode(reg.confirmation_code ?? "") ?? null,
      lastName,
      church,
      keyCount,
      hasWillowKey,
      occupancy: memberships.length,
      status: reg.status as string,
      isOnSite,
      roomNumbers: [...roomSet].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
    };
  });

  // Order by registration number (등록번호) — the trailing sequence of the
  // confirmation code — so labels print in the order people registered and
  // reprints land in the same cell. Missing/unparseable codes sort last.
  labels.sort((a, b) => {
    const sa = a.seqNumber ?? Number.POSITIVE_INFINITY;
    const sb = b.seqNumber ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    return (a.confirmationCode ?? "").localeCompare(b.confirmationCode ?? "");
  });

  return NextResponse.json({ labels });
}
