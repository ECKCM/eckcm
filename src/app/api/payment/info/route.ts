import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`payment-info:${user.id}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const registrationId = body?.registrationId;
    if (!registrationId || typeof registrationId !== "string") {
      return NextResponse.json({ error: "Missing registrationId" }, { status: 400 });
    }

    const { data: registration } = await supabase
      .from("eckcm_registrations")
      .select("id, status, created_by_user_id, total_amount_cents, confirmation_code, event_id")
      .eq("id", registrationId)
      .single();

    if (!registration) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    if (registration.created_by_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (registration.status === "PAID") {
      return NextResponse.json({ error: "Registration already paid" }, { status: 409 });
    }
    if (registration.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Registration is not payable in status ${registration.status}` },
        { status: 409 }
      );
    }

    const admin = createAdminClient();

    const [repMemberRes, invoiceRes, eventRes] = await Promise.all([
      admin
        .from("eckcm_groups")
        .select("eckcm_group_memberships!inner(eckcm_people!inner(first_name_en, last_name_en, phone, email), role)")
        .eq("registration_id", registrationId)
        .limit(1)
        .maybeSingle(),
      admin
        .from("eckcm_invoices")
        .select("id, total_cents, status")
        .eq("registration_id", registrationId)
        .neq("status", "REFUNDED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("eckcm_events")
        .select("stripe_mode, payment_test_mode")
        .eq("id", registration.event_id)
        .single(),
    ]);

    // Process representative info
    interface MemberRow {
      role: string;
      eckcm_people: {
        first_name_en: string;
        last_name_en: string;
        phone: string | null;
        email: string | null;
      };
    }
    const members = (
      repMemberRes.data as unknown as { eckcm_group_memberships: MemberRow[] } | null
    )?.eckcm_group_memberships;
    const rep = members?.find((m) => m.role === "REPRESENTATIVE") ?? members?.[0];
    const registrantName = rep?.eckcm_people
      ? `${rep.eckcm_people.first_name_en} ${rep.eckcm_people.last_name_en}`
      : null;
    const registrantPhone = rep?.eckcm_people?.phone ?? null;
    const registrantEmail = rep?.eckcm_people?.email ?? null;

    const invoice = invoiceRes.data;
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (invoice.status === "SUCCEEDED") {
      return NextResponse.json({ error: "Invoice already paid" }, { status: 409 });
    }

    const amountCents = invoice.total_cents;
    const event = eventRes.data;
    const paymentTestMode = event?.payment_test_mode === true;

    if (amountCents <= 0) {
      return NextResponse.json({
        freeRegistration: true,
        amount: 0,
        invoiceTotal: amountCents,
        manualPaymentDiscount: 0,
        paymentTestMode,
        registrantName,
        registrantPhone,
        registrantEmail,
      });
    }

    // Calculate manual payment discount
    let manualPaymentDiscount = 0;
    {
      const { count: participantCount } = await admin
        .from("eckcm_group_memberships")
        .select("id", { count: "exact", head: true })
        .in(
          "group_id",
          (
            await admin
              .from("eckcm_groups")
              .select("id")
              .eq("registration_id", registrationId)
          ).data?.map((g: { id: string }) => g.id) ?? []
        );
      const { data: regData } = await admin
        .from("eckcm_registrations")
        .select("registration_group_id")
        .eq("id", registrationId)
        .single();
      if (regData?.registration_group_id && participantCount) {
        const { data: discountFee } = await admin
          .from("eckcm_registration_group_fee_categories")
          .select("eckcm_fee_categories!inner(amount_cents)")
          .eq("registration_group_id", regData.registration_group_id)
          .eq("eckcm_fee_categories.code", "MANUAL_PAYMENT_DISCOUNT")
          .maybeSingle();
        const discountPerPerson =
          (discountFee as any)?.eckcm_fee_categories?.amount_cents ?? 0;
        manualPaymentDiscount = discountPerPerson * participantCount;
      }
    }

    return NextResponse.json({
      amount: paymentTestMode ? 100 : amountCents,
      invoiceTotal: amountCents,
      manualPaymentDiscount,
      paymentTestMode,
      registrantName,
      registrantPhone,
      registrantEmail,
    });
  } catch (err) {
    logger.error("[payment/info] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
