import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getResendClient } from "@/lib/email/resend";
import { getEmailConfig } from "@/lib/email/email-config";
import { logEmail } from "@/lib/email/email-log.service";
import { requireAdmin } from "@/lib/auth/admin";
import { buildConfirmationEmail } from "@/lib/email/templates/confirmation";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { withTimeout } from "@/lib/utils/with-timeout";

// ─── Mock data shared across scenarios ───────────────────────────────────────

const MOCK_BASE = {
  confirmationCode: "R26KIM0001",
  eventName: "ECKCM Summer Camp 2026",
  eventLocation: "Camp Berkshire, NY",
  eventDates: "Jun 21, 2026 ~ Jun 28, 2026",
  totalAmount: "$450.00",
};

const MOCK_PARTICIPANTS_WITH_EPASS = [
  { name: "John Kim (김요한)", epassUrl: "https://my.eckcm.com/epass/JohnKim_abc123def456ghi789" },
  { name: "Mary Kim (김마리아)", epassUrl: "https://my.eckcm.com/epass/MaryKim_xyz987uvw654rst321" },
];

const MOCK_PARTICIPANTS_NO_EPASS = [
  { name: "John Kim (김요한)", epassUrl: "https://my.eckcm.com/dashboard/epass" },
  { name: "Mary Kim (김마리아)", epassUrl: "https://my.eckcm.com/dashboard/epass" },
];

const MOCK_INVOICE = {
  invoiceNumber: "INV-2026-0001",
  lineItems: [
    { description: "Adult Registration (Full Week)", quantity: 1, unitPrice: "$250.00", amount: "$250.00" },
    { description: "Child Registration (Full Week)", quantity: 1, unitPrice: "$150.00", amount: "$150.00" },
    { description: "Airport Ride (JFK → Camp)", quantity: 2, unitPrice: "$25.00", amount: "$50.00" },
  ],
  subtotal: "$450.00",
  total: "$450.00",
  paymentDate: new Date().toLocaleDateString("en-US"),
};

// ─── Scenario builders ────────────────────────────────────────────────────────

type ScenarioResult = {
  subject: string;
  html: string;
  pdf?: { filename: string; content: string };
};

async function buildScenario(
  scenario: string,
  emailConfig: Awaited<ReturnType<typeof getEmailConfig>>
): Promise<ScenarioResult> {
  switch (scenario) {
    // 1. Basic connectivity check
    case "connectivity":
      return {
        subject: "ECKCM — Email Delivery Test",
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 20px;">
            <div style="background:#0f172a;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
              <h1 style="color:#fff;margin:0;font-size:24px;">ECKCM</h1>
              <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">Email Delivery Test</p>
            </div>
            <p style="color:#111827;font-size:16px;">Your email configuration is working correctly.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;">From Address</td>
                  <td style="font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${emailConfig.from}</td></tr>
              ${emailConfig.replyTo ? `<tr><td style="color:#6b7280;font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;">Reply-To</td>
                  <td style="font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right;">${emailConfig.replyTo}</td></tr>` : ""}
              <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Sent At</td>
                  <td style="font-size:13px;padding:6px 0;text-align:right;">${new Date().toLocaleString("en-US")}</td></tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;">East Coast Korean Campmeeting · eckcm.com</p>
          </div>`,
      };

    // 2. Stripe/Card paid confirmation (with receipt PDF)
    case "confirmation_stripe": {
      const html = buildConfirmationEmail({
        ...MOCK_BASE,
        participants: MOCK_PARTICIPANTS_WITH_EPASS,
        paymentMethod: "CARD",
        zelleInfo: null,
        invoiceInfo: { ...MOCK_INVOICE, paymentDate: MOCK_INVOICE.paymentDate },
      });
      let pdf: ScenarioResult["pdf"];
      try {
        const buf = await withTimeout(
          generateInvoicePdf({
            ...MOCK_INVOICE,
            confirmationCode: MOCK_BASE.confirmationCode,
            eventName: MOCK_BASE.eventName,
            issuedDate: new Date().toLocaleDateString("en-US"),
            isPaid: true,
            paymentMethod: "CARD",
          }),
          15_000,
          "PDF timeout"
        );
        pdf = { filename: "eckcm-receipt-INV-2026-0001.pdf", content: buf.toString("base64") };
      } catch {
        // send without PDF
      }
      return {
        subject: `ECKCM Registration Confirmed — ${MOCK_BASE.confirmationCode} [TEST]`,
        html,
        ...(pdf ? { pdf } : {}),
      };
    }

    // 3. Zelle pending (submitted, not yet paid)
    case "confirmation_zelle_pending": {
      const html = buildConfirmationEmail({
        ...MOCK_BASE,
        participants: MOCK_PARTICIPANTS_NO_EPASS,
        paymentMethod: "ZELLE",
        zelleInfo: {
          zelleEmail: emailConfig.zelleEmail ?? "zelle@example.com",
          accountHolder: emailConfig.zelleAccountHolder ?? "EMPOWER MINISTRY GROUP, INC",
          memo: `${MOCK_BASE.confirmationCode} - John Kim - 2125550100 - john@example.com`,
        },
        invoiceInfo: {
          ...MOCK_INVOICE,
          paymentDate: "-",
        },
      });
      return {
        subject: `ECKCM Registration Submitted — ${MOCK_BASE.confirmationCode} [TEST]`,
        html,
      };
    }

    // 4. Zelle confirmed (admin approved payment, e-pass activated)
    case "confirmation_zelle_paid": {
      const html = buildConfirmationEmail({
        ...MOCK_BASE,
        participants: MOCK_PARTICIPANTS_WITH_EPASS,
        paymentMethod: "ZELLE",
        zelleInfo: null,
        invoiceInfo: { ...MOCK_INVOICE, paymentDate: MOCK_INVOICE.paymentDate },
      });
      let pdf: ScenarioResult["pdf"];
      try {
        const buf = await withTimeout(
          generateInvoicePdf({
            ...MOCK_INVOICE,
            confirmationCode: MOCK_BASE.confirmationCode,
            eventName: MOCK_BASE.eventName,
            issuedDate: new Date().toLocaleDateString("en-US"),
            isPaid: true,
            paymentMethod: "ZELLE",
          }),
          15_000,
          "PDF timeout"
        );
        pdf = { filename: "eckcm-receipt-INV-2026-0001.pdf", content: buf.toString("base64") };
      } catch {
        // send without PDF
      }
      return {
        subject: `ECKCM Registration Confirmed — ${MOCK_BASE.confirmationCode} [TEST]`,
        html,
        ...(pdf ? { pdf } : {}),
      };
    }

    // 5. Invoice PDF only (pending invoice, not yet paid)
    case "invoice_pdf": {
      const html = buildConfirmationEmail({
        ...MOCK_BASE,
        participants: MOCK_PARTICIPANTS_NO_EPASS,
        paymentMethod: null,
        zelleInfo: null,
        invoiceInfo: { ...MOCK_INVOICE, paymentDate: "-" },
      });
      let pdf: ScenarioResult["pdf"];
      try {
        const buf = await withTimeout(
          generateInvoicePdf({
            ...MOCK_INVOICE,
            confirmationCode: MOCK_BASE.confirmationCode,
            eventName: MOCK_BASE.eventName,
            issuedDate: new Date().toLocaleDateString("en-US"),
            isPaid: false,
            paymentMethod: "-",
          }),
          15_000,
          "PDF timeout"
        );
        pdf = { filename: "eckcm-invoice-INV-2026-0001.pdf", content: buf.toString("base64") };
      } catch {
        // send without PDF
      }
      return {
        subject: `ECKCM Invoice — ${MOCK_BASE.confirmationCode} [TEST]`,
        html,
        ...(pdf ? { pdf } : {}),
      };
    }

    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminCheck = await requireAdmin();
  if (!adminCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { to, scenario = "connectivity" } = body as { to: string; scenario?: string };

  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "Missing 'to' email address" }, { status: 400 });
  }

  const VALID_SCENARIOS = [
    "connectivity",
    "confirmation_stripe",
    "confirmation_zelle_pending",
    "confirmation_zelle_paid",
    "invoice_pdf",
  ];
  if (!VALID_SCENARIOS.includes(scenario)) {
    return NextResponse.json({ error: `Invalid scenario. Must be one of: ${VALID_SCENARIOS.join(", ")}` }, { status: 400 });
  }

  const [emailConfig, resend] = await Promise.all([getEmailConfig(), getResendClient()]);

  let scenarioResult: ScenarioResult;
  try {
    scenarioResult = await buildScenario(scenario, emailConfig);
  } catch (err) {
    return NextResponse.json({ error: `Failed to build scenario: ${String(err)}` }, { status: 500 });
  }

  const fromAddresses = [emailConfig.from, "ECKCM <onboarding@resend.dev>"];

  let lastError: unknown = null;
  for (const from of fromAddresses) {
    const { data: sendResult, error } = await resend.emails.send({
      from,
      to,
      ...(emailConfig.replyTo ? { replyTo: emailConfig.replyTo } : {}),
      subject: scenarioResult.subject,
      html: scenarioResult.html,
      ...(scenarioResult.pdf
        ? {
            attachments: [
              {
                filename: scenarioResult.pdf.filename,
                content: scenarioResult.pdf.content,
              },
            ],
          }
        : {}),
    });

    if (!error) {
      await logEmail({
        toEmail: to,
        fromEmail: from,
        subject: scenarioResult.subject,
        template: "test",
        status: "sent",
        resendId: sendResult?.id,
        sentBy: user.id,
      });
      return NextResponse.json({ success: true, from, scenario });
    }

    console.error(`[email/test] scenario=${scenario} failed with from=${from}:`, error);
    lastError = error;
    if (error.message?.includes("not verified")) continue;
    break;
  }

  await logEmail({
    toEmail: to,
    fromEmail: emailConfig.from,
    subject: scenarioResult.subject,
    template: "test",
    status: "failed",
    errorMessage: String(lastError),
    sentBy: user.id,
  });

  return NextResponse.json(
    { error: "Failed to send email. Domain may not be verified in Resend." },
    { status: 500 }
  );
}
