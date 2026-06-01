import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { isManualPaymentMethod } from "@/lib/payment/methods";
import { calculateAge } from "@/lib/utils/validators";

/**
 * GET /api/admin/registrations/card-surcharge?eventId=...
 *
 * Card payers don't receive the per-person MANUAL_PAYMENT_DISCOUNT — they pay
 * that much more, a surcharge intended to offset Stripe's processing fee. This
 * returns the total surcharge collected from card-paid registrations:
 *
 *   surcharge = Σ over PAID card registrations of (discountPerPerson × billableCount)
 *
 * where billableCount only counts age-eligible, fee-paying participants — the
 * same basis the pricing engine uses for the discount. The caller pairs this
 * with the actual Stripe fees (Gross − Net Collected) to show a Fee Balance.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const eventId = new URL(request.url).searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("eckcm_events")
    .select("event_start_date, early_registration_start, early_registration_end")
    .eq("id", eventId)
    .single();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // 1. All PAID registrations + their payment method (to keep only card-paid).
  const { data: regs } = await supabase
    .from("eckcm_registrations")
    .select("id, registration_group_id, eckcm_invoices(eckcm_payments(payment_method, status))")
    .eq("event_id", eventId)
    .eq("status", "PAID");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardRegs = (regs ?? []).filter((r: any) => {
    const payments = r.eckcm_invoices?.[0]?.eckcm_payments ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pay = payments.find((p: any) => p.status === "SUCCEEDED") ?? payments[0];
    return pay && !isManualPaymentMethod(pay.payment_method);
  });

  if (cardRegs.length === 0) {
    return NextResponse.json({ surchargeCents: 0, cardRegistrations: 0 });
  }

  const cardRegIds = cardRegs.map((r: { id: string }) => r.id);
  const regGroupIds = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Set(cardRegs.map((r: any) => r.registration_group_id).filter(Boolean))
  ) as string[];

  // 2. Registration-group fees + fee-category links (REG_FEE / EARLY_BIRD age
  //    bounds + MANUAL_PAYMENT_DISCOUNT amount), batched.
  const [{ data: groups }, { data: feeLinks }, { data: regGroupRows }] = await Promise.all([
    supabase
      .from("eckcm_registration_groups")
      .select("id, global_registration_fee_cents, global_early_bird_fee_cents, early_bird_deadline")
      .in("id", regGroupIds),
    supabase
      .from("eckcm_registration_group_fee_categories")
      .select("registration_group_id, eckcm_fee_categories!inner(code, amount_cents, age_min, age_max)")
      .in("registration_group_id", regGroupIds),
    // registration → its room groups (eckcm_groups) for member lookup
    supabase
      .from("eckcm_groups")
      .select("id, registration_id")
      .in("registration_id", cardRegIds),
  ]);

  // 3. Members (with birth dates) for all those room groups, batched.
  const roomGroupIds = (regGroupRows ?? []).map((g: { id: string }) => g.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let members: any[] = [];
  if (roomGroupIds.length > 0) {
    const { data } = await supabase
      .from("eckcm_group_memberships")
      .select("group_id, eckcm_people!inner(birth_date)")
      .in("group_id", roomGroupIds);
    members = data ?? [];
  }

  // ─── Build lookup maps ───────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupById = new Map<string, any>();
  for (const g of groups ?? []) groupById.set(g.id, g);

  // registration_group_id → { discountPerPerson, regFee cat, earlyBird cat }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feesByRegGroup = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const link of feeLinks ?? []) {
    const rgId = (link as any).registration_group_id;
    const cat = (link as any).eckcm_fee_categories;
    if (!feesByRegGroup.has(rgId)) feesByRegGroup.set(rgId, {});
    const bucket = feesByRegGroup.get(rgId);
    if (cat.code === "REG_FEE") bucket.regFee = cat;
    else if (cat.code === "EARLY_BIRD") bucket.earlyBird = cat;
    else if (cat.code === "MANUAL_PAYMENT_DISCOUNT") bucket.discount = cat;
  }

  // roomGroupId → registrationId
  const roomGroupToReg = new Map<string, string>();
  for (const g of regGroupRows ?? []) roomGroupToReg.set(g.id, (g as { registration_id: string }).registration_id);

  // registrationId → birth dates of its members
  const birthDatesByReg = new Map<string, (string | null)[]>();
  for (const m of members) {
    const regId = roomGroupToReg.get(m.group_id);
    if (!regId) continue;
    const arr = birthDatesByReg.get(regId) ?? [];
    arr.push(m.eckcm_people?.birth_date ?? null);
    birthDatesByReg.set(regId, arr);
  }

  const eventStart = new Date(event.event_start_date + "T00:00:00");
  const now = new Date();
  const isAgeEligible = (min: number | null, max: number | null, age: number) =>
    (min == null || age >= min) && (max == null || age <= max);

  let surchargeCents = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const reg of cardRegs as any[]) {
    const rgId = reg.registration_group_id;
    const fees = rgId ? feesByRegGroup.get(rgId) : null;
    const grp = rgId ? groupById.get(rgId) : null;
    const discountPerPerson = fees?.discount?.amount_cents ?? 0;
    if (discountPerPerson <= 0) continue;

    const feeAmount = grp?.global_registration_fee_cents ?? fees?.regFee?.amount_cents ?? 0;
    const earlyBirdAmount = grp?.global_early_bird_fee_cents ?? fees?.earlyBird?.amount_cents ?? null;

    const effDeadline = grp?.early_bird_deadline ?? event.early_registration_end ?? null;
    const effStart = event.early_registration_start ?? null;
    const eb =
      effDeadline != null && now < new Date(effDeadline) && (effStart == null || now >= new Date(effStart));

    const activeFee = eb && earlyBirdAmount != null ? earlyBirdAmount : feeAmount;
    if (activeFee === 0) continue; // no registration fee → no billable participants

    const ageMin = eb && earlyBirdAmount != null ? fees?.earlyBird?.age_min ?? null : fees?.regFee?.age_min ?? null;
    const ageMax = eb && earlyBirdAmount != null ? fees?.earlyBird?.age_max ?? null : fees?.regFee?.age_max ?? null;

    const birthDates = birthDatesByReg.get(reg.id) ?? [];
    let billable = 0;
    for (const bd of birthDates) {
      if (!bd) {
        billable++; // no birth date → treat as adult (eligible)
        continue;
      }
      const age = calculateAge(new Date(bd + "T00:00:00"), eventStart);
      if (isAgeEligible(ageMin, ageMax, age)) billable++;
    }

    surchargeCents += discountPerPerson * billable;
  }

  return NextResponse.json({ surchargeCents, cardRegistrations: cardRegs.length });
}
