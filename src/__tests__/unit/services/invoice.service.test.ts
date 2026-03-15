import { describe, it, expect } from "vitest";
import {
  generateInvoiceNumber,
  extractSeqFromConfirmationCode,
} from "@/lib/services/invoice.service";

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
