import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/utils/formatters";
import { extractSeqFromConfirmationCode } from "@/lib/services/invoice.service";
import { formatPaymentMethod } from "@/lib/payment/methods";
import { chunkedIn } from "@/lib/supabase/chunked-in";
import {
  formatMeals,
  formatStayDates,
  formatKeyDeposit,
  type MealRow,
  type KeyDepositGroup,
} from "@/lib/print/registration-summary";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/admin/print/registrations?eventId=xxx&status=PAID
 *
 * Returns one fully-shaped record per registration for the landscape "ECKCM
 * Registration Summary" print sheet — header meta, room assignments, key deposit,
 * per-participant stay dates + meal plan + title, and the invoice pricing
 * breakdown. DRAFT and CANCELLED are excluded by default.
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

  // ── Registrations (+ event meal window + registration group / waived flag) ──
  let regQuery = admin
    .from("eckcm_registrations")
    .select(
      `
      id,
      confirmation_code,
      total_amount_cents,
      start_date,
      end_date,
      nights_count,
      registration_type,
      status,
      eckcm_events!inner(name_en, event_start_date, event_end_date),
      eckcm_registration_groups(name_en)
    `
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
    return NextResponse.json({ registrations: [] });
  }

  const regIds = registrations.map((r) => r.id);

  // ── Bulk-load everything keyed by registration ──
  const [
    groupsResult,
    membershipsResult,
    mealsResult,
    invoicesResult,
    titlesResult,
    ridesResult,
  ] = await Promise.all([
    // Room groups: lodging type, key count, and group-level room assignment.
    chunkedIn(
      admin,
      "eckcm_groups",
      `id, registration_id, display_group_code, lodging_type, key_count, eckcm_room_assignments(eckcm_rooms(room_number))`,
      "registration_id",
      regIds
    ),
    // Participants (one row per group membership).
    chunkedIn(
      admin,
      "eckcm_group_memberships",
      `id, role, title_id, participant_code, stay_start_date, stay_end_date, eckcm_people!inner(id, first_name_en, last_name_en, display_name_ko, gender, age_at_event, is_k12, grade, phone, email, church_other, guardian_name, guardian_phone, eckcm_churches(name_en), eckcm_departments(name_en)), eckcm_groups!inner(registration_id, display_group_code)`,
      "eckcm_groups.registration_id",
      regIds
    ),
    // Meal selections (per person, per date, per meal type).
    chunkedIn(
      admin,
      "eckcm_meal_selections",
      "registration_id, person_id, meal_date, meal_type, is_selected",
      "registration_id",
      regIds
    ),
    // First (most recent) invoice per registration for the pricing breakdown.
    // Chunked on registration_id so each reg's invoices stay in one chunk and
    // the per-chunk issued_at ordering preserves "first seen = most recent".
    chunkedIn(
      admin,
      "eckcm_invoices",
      `registration_id, total_cents, eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents), eckcm_payments(payment_method, status)`,
      "registration_id",
      regIds,
      { order: { column: "issued_at", ascending: false } }
    ),
    // Participant title taxonomy (name / color / icon) — small, no id filter.
    admin.from("eckcm_participant_titles").select("id, name, color, icon"),
    // Airport rides: existence of any passenger row = this registration is on
    // the airport pickup list (set at registration submit / admin assignment).
    chunkedIn(
      admin,
      "eckcm_registration_rides",
      "registration_id",
      "registration_id",
      regIds
    ),
  ]);

  // Registrations that have at least one airport ride passenger row.
  const airportRegIds = new Set<string>();
  for (const r of (ridesResult.data ?? []) as any[]) {
    if (r.registration_id) airportRegIds.add(r.registration_id);
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
  // membershipIds is larger than regIds, so this is chunked too — a single
  // `.in()` here overflowed the request URL and silently dropped all rooms.
  const willowRoomByMembership = new Map<string, string>();
  const willowResult = await chunkedIn(
    admin,
    "eckcm_willow_assignments",
    "membership_id, eckcm_rooms(room_number)",
    "membership_id",
    membershipIds
  );
  for (const w of willowResult.data as any[]) {
    const roomNumber = w.eckcm_rooms?.room_number;
    if (w.membership_id && roomNumber) {
      willowRoomByMembership.set(w.membership_id, roomNumber);
    }
  }

  // Meal rows by registration → person.
  const mealsByRegPerson = new Map<string, Map<string, MealRow[]>>();
  for (const r of (mealsResult.data ?? []) as any[]) {
    if (!mealsByRegPerson.has(r.registration_id)) {
      mealsByRegPerson.set(r.registration_id, new Map());
    }
    const byPerson = mealsByRegPerson.get(r.registration_id)!;
    if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, []);
    byPerson.get(r.person_id)!.push({
      meal_date: r.meal_date,
      meal_type: r.meal_type,
      is_selected: !!r.is_selected,
    });
  }

  // First invoice per registration (for the pricing breakdown) + all payments
  // (to resolve the displayed payment method).
  const invoiceByReg = new Map<string, any>();
  const paymentsByReg = new Map<string, any[]>();
  for (const inv of (invoicesResult.data ?? []) as any[]) {
    if (!invoiceByReg.has(inv.registration_id)) invoiceByReg.set(inv.registration_id, inv);
    for (const pay of inv.eckcm_payments ?? []) {
      if (!paymentsByReg.has(inv.registration_id)) paymentsByReg.set(inv.registration_id, []);
      paymentsByReg.get(inv.registration_id)!.push(pay);
    }
  }

  // Title lookup.
  const titleById = new Map<
    string,
    { name: string; color: string | null; icon: string | null }
  >();
  for (const t of (titlesResult.data ?? []) as any[]) {
    titleById.set(t.id, { name: t.name, color: t.color ?? null, icon: t.icon ?? null });
  }

  const fmt = (c: number) => formatCurrency(c);

  // ── Shape one record per registration ──
  const result = registrations.map((reg: any) => {
    const event = reg.eckcm_events ?? {};
    const eventStart: string | null = event.event_start_date ?? null;
    const eventEnd: string | null = event.event_end_date ?? null;
    const regGroup = reg.eckcm_registration_groups ?? null;

    const groups = groupsByReg.get(reg.id) ?? [];
    const memberships = membershipsByReg.get(reg.id) ?? [];
    const mealsForReg = mealsByRegPerson.get(reg.id) ?? new Map<string, MealRow[]>();
    const inv = invoiceByReg.get(reg.id);

    // Payment method: prefer a succeeded payment, otherwise the first recorded.
    const payments = paymentsByReg.get(reg.id) ?? [];
    const chosenPayment =
      payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0] ?? null;
    const paymentMethod = formatPaymentMethod(chosenPayment?.payment_method);

    // Room numbers: group-level assignments + Willow per-person assignments.
    const roomSet = new Set<string>();
    for (const g of groups) {
      const raRaw = g.eckcm_room_assignments;
      const ra = Array.isArray(raRaw) ? raRaw[0] : raRaw;
      const rn = ra?.eckcm_rooms?.room_number;
      if (rn) roomSet.add(rn);
    }

    // Key deposit summary (Waived / N keys / Willow Key).
    const keyGroups: KeyDepositGroup[] = groups.map((g: any) => ({
      lodgingType: g.lodging_type ?? null,
      keyCount: g.key_count ?? 0,
    }));
    const keyDeposit = formatKeyDeposit(keyGroups);

    const participants = memberships.map((m: any) => {
      const p = m.eckcm_people;
      const willowRoom = willowRoomByMembership.get(m.id);
      if (willowRoom) roomSet.add(willowRoom);

      const stayStart = m.stay_start_date ?? reg.start_date;
      const stayEnd = m.stay_end_date ?? reg.end_date;
      const mealRows = mealsForReg.get(p.id) ?? [];

      return {
        name: `${p.first_name_en ?? ""} ${p.last_name_en ?? ""}`.trim(),
        nameKo: p.display_name_ko,
        gender: p.gender ?? "-",
        age: p.age_at_event,
        isK12: p.is_k12 ?? false,
        grade: p.grade,
        stayDates: formatStayDates(stayStart, stayEnd),
        meals: formatMeals(mealRows, eventStart, eventEnd, {
          start: stayStart,
          end: stayEnd,
        }),
        church: p.church_other || p.eckcm_churches?.name_en || null,
        department: p.eckcm_departments?.name_en ?? null,
        email: p.email,
        phone: p.phone,
        guardianName: p.guardian_name,
        guardianPhone: p.guardian_phone,
        title: m.title_id ? titleById.get(m.title_id) ?? null : null,
        role: m.role ?? "MEMBER",
        participantCode: m.participant_code ?? null,
      };
    });

    // Representative first, then keep load order (which groups members together).
    participants.sort((a: any, b: any) => {
      const ra = a.role === "REPRESENTATIVE" ? 0 : 1;
      const rb = b.role === "REPRESENTATIVE" ? 0 : 1;
      return ra - rb;
    });

    const lineItems = inv
      ? (inv.eckcm_invoice_line_items ?? []).map(
          (li: {
            description_en: string;
            quantity: number;
            unit_price_cents: number;
            total_cents: number;
          }) => ({
            description: li.description_en,
            quantity: li.quantity,
            unitPrice: fmt(li.unit_price_cents),
            amount: fmt(li.total_cents),
          })
        )
      : [];

    return {
      id: reg.id,
      confirmationCode: reg.confirmation_code,
      seqNumber: extractSeqFromConfirmationCode(reg.confirmation_code ?? "") ?? null,
      eventName: event.name_en ?? "East Coast Korean Camp Meeting",
      startDate: reg.start_date,
      endDate: reg.end_date,
      nightsCount: reg.nights_count ?? 0,
      registrationType: reg.registration_type ?? "self",
      status: reg.status,
      paymentMethod,
      hasAirport: airportRegIds.has(reg.id),
      registrationGroup: regGroup?.name_en ?? null,
      roomNumbers: [...roomSet].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
      ),
      keyDeposit,
      participants,
      lineItems,
      total: fmt(reg.total_amount_cents),
    };
  });

  return NextResponse.json({ registrations: result });
}
