import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/print/registrations?eventId=xxx&status=PAID
 * Returns registration data with participants and invoice line items for bulk printing.
 */
export async function GET(req: NextRequest) {
  const adminAuth = await requireAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId");
  const status = req.nextUrl.searchParams.get("status");

  if (!eventId) {
    return NextResponse.json(
      { error: "eventId is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Build registration query
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
      created_by_user_id,
      eckcm_events!inner(name_en)
    `
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (status && status !== "ALL") {
    regQuery = regQuery.eq("status", status);
  } else {
    // Exclude drafts and cancelled by default
    regQuery = regQuery.not("status", "in", '("DRAFT","CANCELLED")');
  }

  const { data: registrations, error: regError } = await regQuery;

  if (regError) {
    return NextResponse.json(
      { error: regError.message },
      { status: 500 }
    );
  }

  if (!registrations || registrations.length === 0) {
    return NextResponse.json({ registrations: [] });
  }

  const regIds = registrations.map((r) => r.id);

  // Load all participants and invoices for these registrations in bulk
  const [membershipsResult, invoicesResult] = await Promise.all([
    admin
      .from("eckcm_group_memberships")
      .select(
        `
        role,
        eckcm_people!inner(
          first_name_en, last_name_en, display_name_ko,
          gender, age_at_event, is_k12, grade,
          phone, email, church_other,
          guardian_name, guardian_phone,
          eckcm_churches(name_en),
          eckcm_departments(name_en)
        ),
        eckcm_groups!inner(registration_id, display_group_code)
      `
      )
      .in("eckcm_groups.registration_id", regIds),
    admin
      .from("eckcm_invoices")
      .select(
        `
        registration_id,
        total_cents,
        eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents)
      `
      )
      .in("registration_id", regIds)
      .order("issued_at", { ascending: false }),
  ]);

  // Group memberships by registration_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membershipsByReg = new Map<string, any[]>();
  for (const m of (membershipsResult.data ?? []) as any[]) {
    const rid = m.eckcm_groups?.registration_id;
    if (!rid) continue;
    if (!membershipsByReg.has(rid)) membershipsByReg.set(rid, []);
    membershipsByReg.get(rid)!.push(m);
  }

  // Get first invoice per registration (most recent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceByReg = new Map<string, any>();
  for (const inv of (invoicesResult.data ?? []) as any[]) {
    if (!invoiceByReg.has(inv.registration_id)) {
      invoiceByReg.set(inv.registration_id, inv);
    }
  }

  // Build response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = registrations.map((reg: any) => {
    const memberships = membershipsByReg.get(reg.id) ?? [];
    const inv = invoiceByReg.get(reg.id);

    const participants = memberships.map((m: any) => {
      const p = m.eckcm_people;
      return {
        name: `${p.first_name_en} ${p.last_name_en}`,
        nameKo: p.display_name_ko,
        gender: p.gender ?? "-",
        age: p.age_at_event,
        isK12: p.is_k12 ?? false,
        grade: p.grade,
        email: p.email,
        phone: p.phone,
        church: p.church_other || p.eckcm_churches?.name_en || null,
        department: p.eckcm_departments?.name_en ?? null,
        guardianName: p.guardian_name,
        guardianPhone: p.guardian_phone,
        groupCode: m.eckcm_groups?.display_group_code ?? "-",
        role: m.role ?? "MEMBER",
      };
    });

    const fmtCents = (c: number) =>
      c < 0
        ? `-$${(Math.abs(c) / 100).toFixed(2)}`
        : `$${(c / 100).toFixed(2)}`;

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
            unitPrice: fmtCents(li.unit_price_cents),
            amount: fmtCents(li.total_cents),
          })
        )
      : [];

    return {
      id: reg.id,
      confirmationCode: reg.confirmation_code,
      eventName: reg.eckcm_events?.name_en ?? "ECKCM Event",
      startDate: reg.start_date,
      endDate: reg.end_date,
      nightsCount: reg.nights_count ?? 0,
      registrationType: reg.registration_type ?? "self",
      status: reg.status,
      totalAmount: fmtCents(reg.total_amount_cents),
      participants,
      lineItems,
      subtotal: inv ? fmtCents(inv.total_cents) : fmtCents(reg.total_amount_cents),
      total: fmtCents(reg.total_amount_cents),
    };
  });

  return NextResponse.json({ registrations: result });
}
