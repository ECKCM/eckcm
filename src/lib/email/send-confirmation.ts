import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { generateRegistrationSummaryPdf, type SummaryParticipant } from "@/lib/pdf/generate-summary";
import { generateEPassToken } from "@/lib/services/epass.service";
import { withTimeout } from "@/lib/utils/with-timeout";

export async function sendConfirmationEmail(
  registrationId: string,
  sentBy?: string | null,
  options?: {
    paymentMethod?: string;
    /** Control which PDFs to attach: 'both' (default for Stripe paid), 'invoice-only' (pending), 'receipt-only' (manual payment confirmed) */
    pdfMode?: "both" | "invoice-only" | "receipt-only";
  }
): Promise<void> {
  const admin = createAdminClient();

  // 1. Load registration, memberships, tokens, and invoice in parallel
  const [regResult, membershipsResult, tokensResult, invoiceResult] = await Promise.all([
    admin
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
        created_by_user_id,
        event_id,
        status,
        eckcm_events!inner(name_en, location, event_start_date, event_end_date)
      `
      )
      .eq("id", registrationId)
      .single(),
    admin
      .from("eckcm_group_memberships")
      .select(
        `
        person_id,
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
      .from("eckcm_epass_tokens")
      .select("person_id, token")
      .eq("registration_id", registrationId)
      .eq("is_active", true),
    admin
      .from("eckcm_invoices")
      .select(
        `
        id,
        invoice_number,
        total_cents,
        status,
        paid_at,
        eckcm_invoice_line_items(description_en, quantity, unit_price_cents, total_cents),
        eckcm_payments(payment_method, status)
      `
      )
      .eq("registration_id", registrationId)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const registration = regResult.data;
  if (!registration) {
    console.error(
      `[sendConfirmationEmail] Registration not found: ${registrationId}`
    );
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = registration as any;

  // 2. Fetch user email + email config + resend client in parallel
  const [userResult, emailConfig, resend] = await Promise.all([
    admin.auth.admin.getUserById(reg.created_by_user_id),
    getEmailConfig(),
    getResendClient(),
  ]);

  const user = userResult.data?.user;
  if (!user?.email) {
    console.error(
      `[sendConfirmationEmail] No email for user: ${reg.created_by_user_id}`
    );
    return;
  }

  if (tokensResult.error) {
    console.error(
      `[sendConfirmationEmail] Failed to query epass tokens for registration ${registrationId}:`,
      tokensResult.error
    );
  }

  const tokenMap = new Map(
    (tokensResult.data ?? []).map((t) => [t.person_id, t.token])
  );

  // Recovery: PAID registration with missing tokens — generate them now.
  // This handles cases where token insertion failed during payment confirmation.
  if ((reg.status === "PAID" || reg.status === "APPROVED") && (membershipsResult.data ?? []).length > 0) {
    const missingPersonIds = (membershipsResult.data as { person_id: string }[])
      .map((m) => m.person_id)
      .filter((id) => !tokenMap.has(id));

    if (missingPersonIds.length > 0) {
      console.warn(
        `[sendConfirmationEmail] PAID registration ${registrationId} missing ${missingPersonIds.length} epass token(s) — recovering`
      );
      try {
        const newTokens = missingPersonIds.map((personId) => {
          const { token, tokenHash } = generateEPassToken();
          return {
            person_id: personId,
            registration_id: registrationId,
            token,
            token_hash: tokenHash,
            is_active: true,
          };
        });
        const { data: inserted, error: recoveryError } = await admin
          .from("eckcm_epass_tokens")
          .insert(newTokens)
          .select("person_id, token");
        if (recoveryError) {
          console.error(
            `[sendConfirmationEmail] Token recovery insert failed:`,
            recoveryError
          );
        } else {
          (inserted ?? []).forEach((t) => tokenMap.set(t.person_id, t.token));
          console.log(
            `[sendConfirmationEmail] Token recovery succeeded: generated ${inserted?.length ?? 0} token(s)`
          );
        }
      } catch (err) {
        console.error(`[sendConfirmationEmail] Token recovery error:`, err);
      }
    }
  }

  const baseUrl = process.env.APP_URL || "https://my.eckcm.com";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participants = (membershipsResult.data ?? []).map((m: any) => {
    const person = m.eckcm_people;
    const name =
      person.display_name_ko ||
      `${person.first_name_en} ${person.last_name_en}`;
    const token = tokenMap.get(m.person_id);
    // Build slug with name prefix so extractTokenFromSlug works correctly
    // (tokens can contain underscores from base64url encoding)
    const slug = token
      ? `${person.first_name_en}${person.last_name_en}`.replace(/[^a-zA-Z0-9]/g, "") + `_${token}`
      : null;
    return {
      name,
      epassUrl: slug ? `${baseUrl}/epass/${slug}` : `${baseUrl}/dashboard/epass`,
    };
  });

  const eventDates = `${reg.start_date} ~ ${reg.end_date}`;
  const totalAmount = `$${(reg.total_amount_cents / 100).toFixed(2)}`;

  // Detect payment method: prefer explicit option, then DB lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceData = invoiceResult.data as any;
  const paymentMethod =
    options?.paymentMethod ||
    (invoiceData?.eckcm_payments?.[0]?.payment_method as string | undefined) ||
    null;

  const isZelle = paymentMethod === "ZELLE";
  const isCheck = paymentMethod === "CHECK";
  const isManualPayment = isZelle || isCheck;
  const invoicePaid = invoiceData?.status === "SUCCEEDED";
  const isZellePending = isZelle && !invoicePaid;
  const isManualPending = isManualPayment && !invoicePaid;

  // Build Zelle info only for pending Zelle (not yet confirmed by admin)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstMember = (membershipsResult.data ?? [])[0] as any;
  const registrantPhone = firstMember?.eckcm_people?.phone?.replace(/\D/g, "") || "";
  const zelleInfo = isZellePending
    ? {
        zelleEmail: emailConfig.zelleEmail ?? "",
        accountHolder: emailConfig.zelleAccountHolder ?? "",
        memo: `${reg.confirmation_code}-${firstMember?.eckcm_people?.first_name_en || ""}${firstMember?.eckcm_people?.last_name_en || ""}-${registrantPhone}-${user.email.replace(/[@.]/g, "")}`,
      }
    : null;

  // Build invoice/receipt info for paid registrations
  const invoiceInfo =
    invoiceData && invoiceData.invoice_number
      ? {
          invoiceNumber: invoiceData.invoice_number,
          lineItems: (invoiceData.eckcm_invoice_line_items ?? []).map(
            (li: { description_en: string; quantity: number; unit_price_cents: number; total_cents: number }) => {
              const fmtCents = (c: number) => c < 0 ? `-$${(Math.abs(c) / 100).toFixed(2)}` : `$${(c / 100).toFixed(2)}`;
              return {
                description: li.description_en,
                quantity: li.quantity,
                unitPrice: fmtCents(li.unit_price_cents),
                amount: fmtCents(li.total_cents),
              };
            }
          ),
          subtotal: `$${(invoiceData.total_cents / 100).toFixed(2)}`,
          total: `$${(invoiceData.total_cents / 100).toFixed(2)}`,
          paymentDate: invoiceData.paid_at
            ? new Date(invoiceData.paid_at).toLocaleDateString("en-US")
            : "-",
        }
      : null;

  // Always include invoice/receipt in email
  const includeInvoice = invoiceInfo;

  const html = buildConfirmationEmail({
    confirmationCode: reg.confirmation_code,
    eventName: reg.eckcm_events.name_en,
    eventLocation: reg.eckcm_events.location || "TBD",
    eventDates,
    participants,
    totalAmount,
    paymentMethod,
    zelleInfo,
    invoiceInfo: includeInvoice,
  });
  const subject = isManualPending
    ? `ECKCM Registration Submitted - ${reg.confirmation_code}`
    : `ECKCM Registration Confirmed - ${reg.confirmation_code}`;

  // Generate PDF attachments (with 15s timeout — don't let it block email delivery)
  // Invoice PDF: always shows PENDING PAYMENT (the billing document)
  // Receipt PDF: always shows PAID (proof of payment) — only when paid
  //
  // pdfMode controls which PDFs to attach:
  //   - 'both' (default for Stripe paid): Invoice + Receipt
  //   - 'invoice-only' (default for pending): Invoice only
  //   - 'receipt-only' (manual payment confirmed): Receipt only
  const pdfAttachments: { filename: string; content: Buffer }[] = [];
  if (includeInvoice) {
    const explicitMode = options?.pdfMode;
    const pdfMode: "both" | "invoice-only" | "receipt-only" = explicitMode
      ?? (invoicePaid ? "both" : "invoice-only");

    const eventEndDate = reg.eckcm_events.event_end_date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParticipants = (membershipsResult.data ?? []).map((m: any) => {
      const p = m.eckcm_people;
      const fullName = `${p.first_name_en} ${p.last_name_en}`;
      return p.display_name_ko ? `${fullName} (${p.display_name_ko})` : fullName;
    });

    const basePdfData = {
      invoiceNumber: includeInvoice.invoiceNumber,
      confirmationCode: reg.confirmation_code,
      eventName: reg.eckcm_events.name_en,
      issuedDate: new Date().toLocaleDateString("en-US"),
      billTo: user.email!,
      dateDue: eventEndDate ? new Date(eventEndDate + "T00:00:00").toLocaleDateString("en-US") : undefined,
      participants: pdfParticipants,
      lineItems: includeInvoice.lineItems.map((li: { description: string; quantity: number; unitPrice: string; amount: string }) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
      })),
      subtotal: includeInvoice.subtotal,
      total: includeInvoice.total,
    };

    try {
      // Attach Invoice PDF (PENDING PAYMENT) — unless receipt-only mode
      if (pdfMode !== "receipt-only") {
        const invoicePdfBuffer = await withTimeout(
          generateInvoicePdf({
            ...basePdfData,
            isPaid: false,
            paymentMethod: "-",
            paymentDate: "-",
          }),
          15_000,
          "Invoice PDF generation timeout"
        );
        pdfAttachments.push({
          filename: `eckcm-invoice-${includeInvoice.invoiceNumber}.pdf`,
          content: invoicePdfBuffer,
        });
      }

      // Attach Receipt PDF (PAID) — unless invoice-only mode
      if (pdfMode !== "invoice-only" && invoicePaid) {
        const receiptPdfBuffer = await withTimeout(
          generateInvoicePdf({
            ...basePdfData,
            isPaid: true,
            paymentMethod: paymentMethod ?? "-",
            paymentDate: includeInvoice.paymentDate,
          }),
          15_000,
          "Receipt PDF generation timeout"
        );
        pdfAttachments.push({
          filename: `eckcm-receipt-${includeInvoice.invoiceNumber}.pdf`,
          content: receiptPdfBuffer,
        });
      }
    } catch (err) {
      console.error("[sendConfirmationEmail] PDF generation failed:", err);
    }
  }

  // Generate Registration Summary PDF (always attach)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryParticipants: SummaryParticipant[] = (membershipsResult.data ?? []).map((m: any) => {
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

    const summaryPdfBuffer = await withTimeout(
      generateRegistrationSummaryPdf({
        confirmationCode: reg.confirmation_code,
        eventName: reg.eckcm_events.name_en,
        startDate: reg.start_date,
        endDate: reg.end_date,
        nightsCount: reg.nights_count ?? Math.max(0, Math.round((new Date(reg.end_date).getTime() - new Date(reg.start_date).getTime()) / 86400000)),
        status: reg.status,
        registrantName: summaryParticipants.find(p => p.role === "REPRESENTATIVE")?.name ?? user.email!,
        registrantEmail: user.email!,
        registrationType: reg.registration_type ?? "self",
        totalAmount,
        participants: summaryParticipants,
        lineItems: includeInvoice
          ? includeInvoice.lineItems.map((li: { description: string; quantity: number; unitPrice: string; amount: string }) => ({
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              amount: li.amount,
            }))
          : [],
        subtotal: includeInvoice?.subtotal ?? totalAmount,
        total: includeInvoice?.total ?? totalAmount,
      }),
      15_000,
      "Summary PDF generation timeout"
    );
    pdfAttachments.push({
      filename: `eckcm-summary-${reg.confirmation_code}.pdf`,
      content: summaryPdfBuffer,
    });
  } catch (err) {
    console.error("[sendConfirmationEmail] Summary PDF generation failed:", err);
  }

  // Collect unique participant emails to also send to (for "others" registrations)
  const participantEmails = new Set<string>();
  for (const m of (membershipsResult.data ?? []) as any[]) {
    const email = m.eckcm_people?.email;
    if (email && email.toLowerCase() !== user.email!.toLowerCase()) {
      participantEmails.add(email.toLowerCase());
    }
  }
  const toAddresses = [user.email, ...participantEmails];

  // Plain text fallback improves deliverability (avoids spam filters)
  const participantNames = participants.map((p, i) => `  ${i + 1}. ${p.name}`).join("\n");
  const text = [
    isManualPending ? "Your registration has been submitted!" : "Your registration has been confirmed!",
    "",
    `Confirmation Code: ${reg.confirmation_code}`,
    "",
    "Event Details:",
    `  Event: ${reg.eckcm_events.name_en}`,
    `  Location: ${reg.eckcm_events.location || "TBD"}`,
    `  Dates: ${eventDates}`,
    `  ${isManualPending ? "Amount Due" : "Amount Paid"}: ${totalAmount}`,
    "",
    "Participants:",
    participantNames,
    "",
    "View your registration at https://my.eckcm.com/dashboard",
    "",
    "East Coast Korean Camp Meeting",
  ].join("\n");

  const { data: sendResult, error } = await resend.emails.send({
    from: emailConfig.from,
    to: toAddresses,
    ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
    subject,
    html,
    text,
    headers: getEmailHeaders(),
    ...(pdfAttachments.length > 0 ? { attachments: pdfAttachments } : {}),
  });

  const toEmailLog = toAddresses.join(", ");
  if (error) {
    console.error("[sendConfirmationEmail] Resend error:", error);
    await logEmail({
      eventId: reg.event_id,
      toEmail: toEmailLog,
      fromEmail: emailConfig.from,
      subject,
      template: "confirmation",
      registrationId,
      status: "failed",
      errorMessage: error.message,
      sentBy: sentBy ?? null,
    });
  } else {
    console.log(
      `[sendConfirmationEmail] Email sent to ${toEmailLog} for registration ${registrationId}`
    );
    await logEmail({
      eventId: reg.event_id,
      toEmail: toEmailLog,
      fromEmail: emailConfig.from,
      subject,
      template: "confirmation",
      registrationId,
      status: "sent",
      resendId: sendResult?.id,
      sentBy: sentBy ?? null,
    });
  }
}
