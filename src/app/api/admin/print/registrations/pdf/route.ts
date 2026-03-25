import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateRegistrationSummaryPdf,
  type RegistrationSummaryPdfData,
} from "@/lib/pdf/generate-summary";

/**
 * GET /api/admin/print/registrations/pdf?eventId=xxx&status=PAID
 * Returns a single PDF containing all registration summaries.
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
    regQuery = regQuery.not("status", "in", '("DRAFT","CANCELLED")');
  }

  const { data: registrations, error: regError } = await regQuery;

  if (regError) {
    return NextResponse.json({ error: regError.message }, { status: 500 });
  }

  if (!registrations || registrations.length === 0) {
    return NextResponse.json(
      { error: "No registrations found" },
      { status: 404 }
    );
  }

  const regIds = registrations.map((r) => r.id);

  // Load all participants, invoices, and registrant emails in bulk
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

  // First invoice per registration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceByReg = new Map<string, any>();
  for (const inv of (invoicesResult.data ?? []) as any[]) {
    if (!invoiceByReg.has(inv.registration_id)) {
      invoiceByReg.set(inv.registration_id, inv);
    }
  }

  // Fetch registrant emails
  const userIds = [...new Set(registrations.map((r) => r.created_by_user_id))];
  const emailByUserId = new Map<string, string>();
  for (const uid of userIds) {
    const { data } = await admin.auth.admin.getUserById(uid);
    if (data?.user?.email) emailByUserId.set(uid, data.user.email);
  }

  // Build summary data for each registration
  const fmtCents = (c: number) =>
    c < 0
      ? `-$${(Math.abs(c) / 100).toFixed(2)}`
      : `$${(c / 100).toFixed(2)}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaries: RegistrationSummaryPdfData[] = registrations.map((reg: any) => {
    const memberships = membershipsByReg.get(reg.id) ?? [];
    const inv = invoiceByReg.get(reg.id);
    const registrantEmail = emailByUserId.get(reg.created_by_user_id) ?? "-";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const totalAmount = fmtCents(reg.total_amount_cents);

    return {
      confirmationCode: reg.confirmation_code,
      eventName: reg.eckcm_events?.name_en ?? "ECKCM Event",
      startDate: reg.start_date,
      endDate: reg.end_date,
      nightsCount: reg.nights_count ?? 0,
      status: reg.status,
      registrantName:
        participants.find(
          (p: { role: string }) => p.role === "REPRESENTATIVE"
        )?.name ?? registrantEmail,
      registrantEmail,
      registrationType: reg.registration_type ?? "self",
      totalAmount,
      participants,
      lineItems,
      subtotal: inv ? fmtCents(inv.total_cents) : totalAmount,
      total: totalAmount,
    };
  });

  // Generate individual PDFs and merge into one document
  const mergedDoc = await PDFDocument.create();

  for (const summary of summaries) {
    const pdfBuffer = await generateRegistrationSummaryPdf(summary);
    const srcDoc = await PDFDocument.load(pdfBuffer);
    const pages = await mergedDoc.copyPages(
      srcDoc,
      srcDoc.getPageIndices()
    );
    for (const p of pages) {
      mergedDoc.addPage(p);
    }
  }

  const mergedBytes = await mergedDoc.save();
  const buffer = Buffer.from(mergedBytes);

  const filename = `eckcm-registration-summaries-${status ?? "all"}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
