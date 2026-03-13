import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { generateInvoicePdf } from "@/lib/pdf/generate";

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

  const type = req.nextUrl.searchParams.get("type") as "invoice" | "receipt" | null;
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
