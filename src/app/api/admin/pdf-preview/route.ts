import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { generateDonationReceiptPdf } from "@/lib/pdf/generate-donation-receipt";
import { donationReceiptNumber } from "@/lib/donation/receipt-info";

const MOCK_LINE_ITEMS = [
  { description: "Adult Registration (Full Week)", quantity: 1, unitPrice: "$250.00", amount: "$250.00" },
  { description: "Child Registration (Full Week)", quantity: 1, unitPrice: "$150.00", amount: "$150.00" },
  { description: "Airport Ride (JFK - Camp)", quantity: 2, unitPrice: "$25.00", amount: "$50.00" },
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") as
    | "invoice"
    | "receipt"
    | "donation-receipt"
    | null;

  // ── Donation tax receipt preview ──
  if (type === "donation-receipt") {
    const donationPdf = await generateDonationReceiptPdf({
      receiptNumber: donationReceiptNumber("3f2a1b9c-0000-0000-0000-000000000001"),
      receiptDate: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/New_York",
      }),
      donorName: "John Doe",
      contributionFormatted: "$103.30",
      baseAmountFormatted: "$100.00",
      coveredFeeFormatted: "$3.30",
      designation: "General Fund",
      paymentReference: "pi_3PExamplePreview001",
    });
    return new NextResponse(new Uint8Array(donationPdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="eckcm-donation-receipt-preview.pdf"`,
        "Content-Length": String(donationPdf.length),
      },
    });
  }

  const isReceipt = type === "receipt";

  const pdfBuffer = await generateInvoicePdf({
    invoiceNumber: "INV-2026-0001",
    confirmationCode: "R26KIM0001",
    eventName: "ECKCM Summer Camp 2026",
    issuedDate: new Date().toLocaleDateString("en-US"),
    isPaid: isReceipt,
    paymentMethod: isReceipt ? "CARD" : "-",
    paymentDate: isReceipt ? new Date().toLocaleDateString("en-US") : "-",
    billTo: "test@eckcm.com",
    dateDue: isReceipt ? undefined : "6/28/2026",
    lineItems: MOCK_LINE_ITEMS,
    subtotal: "$450.00",
    total: "$450.00",
  });

  const docType = isReceipt ? "receipt" : "invoice";
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="eckcm-${docType}-preview.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
