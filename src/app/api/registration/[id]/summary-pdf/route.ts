import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/admin";
import {
  generateRegistrationSummaryPdf,
  type SummaryParticipant,
} from "@/lib/pdf/generate-summary";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminAuth = await requireAdmin();
  const isAdmin = !!adminAuth;
  const admin = createAdminClient();

  // Load registration
  const { data: registration } = await admin
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
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = registration as any;

  // Only owner or admin can access
  if (reg.created_by_user_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load participants + invoice in parallel
  const [membershipsResult, invoiceResult, registrantResult] =
    await Promise.all([
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
        .eq("eckcm_groups.registration_id", registrationId),
      admin
        .from("eckcm_invoices")
        .select(
          `
        invoice_number,
        total_cents,
        eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents)
      `
        )
        .eq("registration_id", registrationId)
        .order("issued_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.auth.admin.getUserById(reg.created_by_user_id),
    ]);

  const registrantEmail =
    registrantResult.data?.user?.email ?? user.email ?? "-";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants: SummaryParticipant[] = (
    membershipsResult.data ?? []
  ).map((m: any) => {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inv = invoiceResult.data as any;
  const fmtCents = (c: number) =>
    c < 0 ? `-$${(Math.abs(c) / 100).toFixed(2)}` : `$${(c / 100).toFixed(2)}`;

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

  const totalAmount = `$${(reg.total_amount_cents / 100).toFixed(2)}`;
  const subtotal = inv
    ? `$${(inv.total_cents / 100).toFixed(2)}`
    : totalAmount;

  const pdfBuffer = await generateRegistrationSummaryPdf({
    confirmationCode: reg.confirmation_code,
    eventName: reg.eckcm_events?.name_en ?? "ECKCM Event",
    startDate: reg.start_date,
    endDate: reg.end_date,
    nightsCount: reg.nights_count ?? 0,
    status: reg.status,
    registrantName:
      participants.find((p) => p.role === "REPRESENTATIVE")?.name ??
      registrantEmail,
    registrantEmail,
    registrationType: reg.registration_type ?? "self",
    totalAmount,
    participants,
    lineItems,
    subtotal,
    total: totalAmount,
  });

  const filename = `eckcm-summary-${reg.confirmation_code}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
