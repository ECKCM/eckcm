import { describe, it, expect, vi } from "vitest";
import {
  generateInvoiceNumber,
  extractSeqFromConfirmationCode,
  buildCustomChargeDescriptionEn,
  buildCustomChargeDescriptionKo,
  buildReductionDescriptionEn,
  buildReductionDescriptionKo,
  applyReductionToRegistration,
} from "@/lib/services/invoice.service";
import { generateInvoicePdf } from "@/lib/pdf/generate";
import { createSequentialMockSupabase } from "../../helpers/mock-supabase";

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

describe("buildReductionDescriptionEn", () => {
  it("inlines a Latin reason with the Discount label", () => {
    expect(buildReductionDescriptionEn("Meal support 6TUC9K", "discount")).toBe(
      "Discount: Meal support 6TUC9K"
    );
  });

  it("uses Price Adjustment label for non-discount types", () => {
    expect(
      buildReductionDescriptionEn("Arrival changed", "admin_correction")
    ).toBe("Price Adjustment: Arrival changed");
  });

  it("falls back to a clean label for a Korean reason (PDF can't render Hangul)", () => {
    expect(buildReductionDescriptionEn("식사 할인", "discount")).toBe("Discount");
  });

  it("falls back to a clean label for an empty reason", () => {
    expect(buildReductionDescriptionEn("  ", "discount")).toBe("Discount");
  });
});

describe("buildReductionDescriptionKo", () => {
  it("keeps the reason verbatim with the 할인 label", () => {
    expect(buildReductionDescriptionKo("식사 지원", "discount")).toBe(
      "할인: 식사 지원"
    );
  });

  it("uses 금액 조정 label for non-discount types", () => {
    expect(buildReductionDescriptionKo("날짜 변경", "admin_correction")).toBe(
      "금액 조정: 날짜 변경"
    );
  });

  it("handles an empty reason", () => {
    expect(buildReductionDescriptionKo("  ", "discount")).toBe("할인");
  });
});

describe("applyReductionToRegistration", () => {
  const happyPathSequence = (overrides?: {
    invoiceTotal?: number;
    lastSort?: number;
    paymentAmount?: number;
  }) => [
    {
      table: "eckcm_invoices",
      op: "select",
      response: {
        data: [
          {
            id: "inv1",
            total_cents: overrides?.invoiceTotal ?? 97500,
            status: "PENDING",
            issued_at: "2026-05-18T22:45:22Z",
          },
        ],
        error: null,
      },
    },
    {
      table: "eckcm_invoice_line_items",
      op: "select",
      response: { data: { sort_order: overrides?.lastSort ?? 999 }, error: null },
    },
    // insert(...).select("id").single() resolves as op "select" in the mock
    {
      table: "eckcm_invoice_line_items",
      op: "select",
      response: { data: { id: "li1" }, error: null },
    },
    { table: "eckcm_invoices", op: "update", response: { data: null, error: null } },
    {
      table: "eckcm_payments",
      op: "select",
      response: {
        data: { id: "pay1", amount_cents: overrides?.paymentAmount ?? 97500 },
        error: null,
      },
    },
    { table: "eckcm_payments", op: "update", response: { data: null, error: null } },
    {
      table: "eckcm_invoices",
      op: "select",
      response: { data: { invoice_number: "INV-2026-0397" }, error: null },
    },
  ];

  it("throws on a non-positive reduction amount", async () => {
    const admin = createSequentialMockSupabase([]);
    await expect(
      applyReductionToRegistration(admin, {
        registrationId: "reg1",
        amountCents: 0,
        reason: "x",
      })
    ).rejects.toThrow();
    await expect(
      applyReductionToRegistration(admin, {
        registrationId: "reg1",
        amountCents: 10.5,
        reason: "x",
      })
    ).rejects.toThrow();
  });

  it("returns null when the registration has no outstanding invoice", async () => {
    const admin = createSequentialMockSupabase([
      { table: "eckcm_invoices", op: "select", response: { data: [], error: null } },
    ]);
    const result = await applyReductionToRegistration(admin, {
      registrationId: "reg1",
      amountCents: 30000,
      reason: "discount",
    });
    expect(result).toBeNull();
  });

  it("adds a negative line item (sort_order >= 1000) and lowers invoice + pending payment", async () => {
    const admin = createSequentialMockSupabase(happyPathSequence());
    const result = await applyReductionToRegistration(admin, {
      registrationId: "reg1",
      amountCents: 30000,
      reason: "6TUC9K meal discounts",
      adjustmentType: "discount",
    });

    expect(result).toEqual({
      invoiceId: "inv1",
      invoiceNumber: "INV-2026-0397",
      lineItemId: "li1",
      appliedCents: 30000,
    });

    // Inspect the line-item insert payload
    const fromMock = admin.from as unknown as ReturnType<typeof vi.fn>;
    const insertCalls = fromMock.mock.results
      .map((r, i) => ({ table: fromMock.mock.calls[i][0], chain: r.value }))
      .filter((c) => c.table === "eckcm_invoice_line_items")
      .flatMap((c) => (c.chain.insert as ReturnType<typeof vi.fn>).mock.calls);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][0]).toMatchObject({
      invoice_id: "inv1",
      description_en: "Discount: 6TUC9K meal discounts",
      description_ko: "할인: 6TUC9K meal discounts",
      quantity: 1,
      unit_price_cents: -30000,
      total_cents: -30000,
      sort_order: 1000,
    });

    // Invoice + payment updates carry the lowered amounts
    const updateCalls = (table: string) =>
      fromMock.mock.results
        .map((r, i) => ({ table: fromMock.mock.calls[i][0], chain: r.value }))
        .filter((c) => c.table === table)
        .flatMap((c) => (c.chain.update as ReturnType<typeof vi.fn>).mock.calls);
    expect(updateCalls("eckcm_invoices")[0][0]).toEqual({ total_cents: 67500 });
    expect(updateCalls("eckcm_payments")[0][0]).toEqual({ amount_cents: 67500 });
  });

  it("caps the reduction at the outstanding invoice total", async () => {
    const admin = createSequentialMockSupabase(
      happyPathSequence({ invoiceTotal: 30000, lastSort: 2, paymentAmount: 30000 })
    );
    const result = await applyReductionToRegistration(admin, {
      registrationId: "reg1",
      amountCents: 50000,
      reason: "big discount",
      adjustmentType: "discount",
    });
    expect(result?.appliedCents).toBe(30000);

    const fromMock = admin.from as unknown as ReturnType<typeof vi.fn>;
    const insertCalls = fromMock.mock.results
      .map((r, i) => ({ table: fromMock.mock.calls[i][0], chain: r.value }))
      .filter((c) => c.table === "eckcm_invoice_line_items")
      .flatMap((c) => (c.chain.insert as ReturnType<typeof vi.fn>).mock.calls);
    // Folds only up to the invoice total; sort_order still forced past the
    // manual-discount slot (999)
    expect(insertCalls[0][0]).toMatchObject({
      total_cents: -30000,
      sort_order: 1000,
    });
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
