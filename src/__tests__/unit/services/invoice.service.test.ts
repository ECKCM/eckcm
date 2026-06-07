import { describe, it, expect } from "vitest";
import {
  generateInvoiceNumber,
  extractSeqFromConfirmationCode,
  buildCustomChargeDescriptionEn,
  buildCustomChargeDescriptionKo,
} from "@/lib/services/invoice.service";
import { generateInvoicePdf } from "@/lib/pdf/generate";

describe("generateInvoiceNumber", () => {
  it("formats as INV-YYYY-NNNN with zero padding", () => {
    expect(generateInvoiceNumber(1, 2026)).toBe("INV-2026-0001");
    expect(generateInvoiceNumber(23, 2026)).toBe("INV-2026-0023");
    expect(generateInvoiceNumber(999, 2026)).toBe("INV-2026-0999");
    expect(generateInvoiceNumber(10000, 2026)).toBe("INV-2026-10000");
  });

  it("uses current year when year not provided", () => {
    const result = generateInvoiceNumber(42);
    const currentYear = new Date().getFullYear();
    expect(result).toBe(`INV-${currentYear}-0042`);
  });
});

describe("extractSeqFromConfirmationCode", () => {
  it("extracts trailing digits: R26KIM0023 -> 23", () => {
    expect(extractSeqFromConfirmationCode("R26KIM0023")).toBe(23);
  });

  it("extracts from various formats", () => {
    expect(extractSeqFromConfirmationCode("R26ABC0001")).toBe(1);
    expect(extractSeqFromConfirmationCode("R26XYZ9999")).toBe(9999);
    expect(extractSeqFromConfirmationCode("CODE123")).toBe(123);
  });

  it("returns null for code with no trailing digits", () => {
    expect(extractSeqFromConfirmationCode("ABCDEF")).toBeNull();
    expect(extractSeqFromConfirmationCode("")).toBeNull();
  });
});

describe("buildCustomChargeDescriptionEn", () => {
  it("inlines a Latin reason", () => {
    expect(buildCustomChargeDescriptionEn("Extra night")).toBe(
      "Custom Charge: Extra night"
    );
  });

  it("falls back to a clean label for a Korean reason (PDF can't render Hangul)", () => {
    expect(buildCustomChargeDescriptionEn("늦은 등록 추가금")).toBe("Custom Charge");
  });

  it("falls back to a clean label for an empty/whitespace reason", () => {
    expect(buildCustomChargeDescriptionEn("   ")).toBe("Custom Charge");
  });
});

describe("buildCustomChargeDescriptionKo", () => {
  it("keeps the reason verbatim", () => {
    expect(buildCustomChargeDescriptionKo("늦은 등록")).toBe("추가 결제: 늦은 등록");
  });

  it("handles an empty reason", () => {
    expect(buildCustomChargeDescriptionKo("  ")).toBe("추가 결제");
  });
});

describe("generateInvoicePdf — CJK safety (regression for Korean-reason crash)", () => {
  const base = {
    invoiceNumber: "INV-2026-0023-C1",
    confirmationCode: "R26KIM0023",
    eventName: "동부 코리안 캠프 집회", // Korean event name
    issuedDate: "06/07/2026",
    isPaid: false,
    paymentMethod: "MANUAL",
    paymentDate: "-",
    billTo: "성도 (saint@example.com)", // Korean in Bill To
    participants: ["홍길동 (Hong Gildong)", "John Doe"],
    lineItems: [
      {
        description: "Custom Charge: 늦은 등록 추가금", // Korean line item — the bug
        quantity: 1,
        unitPrice: "$50.00",
        amount: "$50.00",
      },
    ],
    subtotal: "$50.00",
    total: "$50.00",
  };

  it("does not throw on Korean text and returns a non-empty PDF (invoice)", async () => {
    const buf = await generateInvoicePdf(base);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("does not throw on Korean text and returns a non-empty PDF (receipt)", async () => {
    const buf = await generateInvoicePdf({
      ...base,
      isPaid: true,
      paymentDate: "06/07/2026",
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
