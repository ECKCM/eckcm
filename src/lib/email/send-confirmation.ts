import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig, getEmailHeaders } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { generateEPassToken } from "@/lib/services/epass.service";
import { withTimeout } from "@/lib/utils/with-timeout";

export async function sendConfirmationEmail(
  registrationId: string,
  sentBy?: string | null,
  options?: { paymentMethod?: string }
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
        eckcm_people!inner(first_name_en, last_name_en, display_name_ko, phone),
        eckcm_groups!inner(registration_id)
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
  if (reg.status === "PAID" && (membershipsResult.data ?? []).length > 0) {
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
  const invoicePaid = invoiceData?.status === "SUCCEEDED";
  const isZellePending = isZelle && !invoicePaid;

  // Build Zelle info only for pending Zelle (not yet confirmed by admin)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstMember = (membershipsResult.data ?? [])[0] as any;
  const registrantPhone = firstMember?.eckcm_people?.phone?.replace(/\D/g, "") || "";
  const zelleInfo = isZellePending
    ? {
        zelleEmail: emailConfig.zelleEmail ?? "",
        accountHolder: emailConfig.zelleAccountHolder ?? "",
        memo: `${reg.confirmation_code} - ${participants[0]?.name || "N/A"} - ${registrantPhone} - ${user.email}`,
      }
    : null;

  // Build invoice/receipt info for paid registrations
  const invoiceInfo =
    invoiceData && invoiceData.invoice_number
      ? {
          invoiceNumber: invoiceData.invoice_number,
          lineItems: (invoiceData.eckcm_invoice_line_items ?? []).map(
            (li: { description_en: string; quantity: number; unit_price_cents: number; total_cents: number }) => ({
              description: li.description_en,
              quantity: li.quantity,
              unitPrice: `$${(li.unit_price_cents / 100).toFixed(2)}`,
              amount: `$${(li.total_cents / 100).toFixed(2)}`,
            })
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
  const subject = isZellePending
    ? `ECKCM Registration Submitted - ${reg.confirmation_code}`
    : `ECKCM Registration Confirmed - ${reg.confirmation_code}`;

  // Generate PDF attachment (with 15s timeout — don't let it block email delivery)
  let pdfAttachment: { filename: string; content: Buffer } | null = null;
  if (includeInvoice) {
    try {
      const pdfBuffer = await withTimeout(
        generateInvoicePdf({
          invoiceNumber: includeInvoice.invoiceNumber,
          confirmationCode: reg.confirmation_code,
          eventName: reg.eckcm_events.name_en,
          issuedDate: new Date().toLocaleDateString("en-US"),
          isPaid: invoicePaid,
          paymentMethod: paymentMethod ?? "-",
          paymentDate: includeInvoice.paymentDate,
          lineItems: includeInvoice.lineItems.map((li: { description: string; quantity: number; unitPrice: string; amount: string }) => ({
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            amount: li.amount,
          })),
          subtotal: includeInvoice.subtotal,
          total: includeInvoice.total,
        }),
        15_000,
        "PDF generation timeout"
      );
      const docType = invoicePaid ? "receipt" : "invoice";
      pdfAttachment = {
        filename: `eckcm-${docType}-${includeInvoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
      };
    } catch (err) {
      console.error("[sendConfirmationEmail] PDF generation failed:", err);
    }
  }

  const { data: sendResult, error } = await resend.emails.send({
    from: emailConfig.from,
    to: user.email,
    ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
    subject,
    html,
    headers: getEmailHeaders(emailConfig.replyTo),
    ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
  });

  if (error) {
    console.error("[sendConfirmationEmail] Resend error:", error);
    await logEmail({
      eventId: reg.event_id,
      toEmail: user.email,
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
      `[sendConfirmationEmail] Email sent to ${user.email} for registration ${registrationId}`
    );
    await logEmail({
      eventId: reg.event_id,
      toEmail: user.email,
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
