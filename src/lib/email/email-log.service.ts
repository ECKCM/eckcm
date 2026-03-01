import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

interface LogEmailParams {
  eventId?: string | null;
  toEmail: string;
  fromEmail: string;
  subject: string;
  template: string;
  registrationId?: string | null;
  invoiceId?: string | null;
  status: "sent" | "failed";
  errorMessage?: string | null;
  sentBy?: string | null;
  resendId?: string | null;
}

export async function logEmail(params: LogEmailParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("eckcm_email_logs").insert({
      event_id: params.eventId ?? null,
      to_email: params.toEmail,
      from_email: params.fromEmail,
      subject: params.subject,
      template: params.template,
      registration_id: params.registrationId ?? null,
      invoice_id: params.invoiceId ?? null,
      status: params.status,
      error_message: params.errorMessage ?? null,
      sent_by: params.sentBy ?? null,
      resend_id: params.resendId ?? null,
    });
  } catch (err) {
    logger.error("[logEmail] Failed to log email", { error: String(err) });
  }
}
