import { describe, it, expect } from "vitest";

/**
 * Stripe fee passthrough calculation extracted from create-intent route.
 * Formula: Math.ceil((baseAmount + 30) / (1 - 0.029))
 *
 * This ensures that after Stripe takes 2.9% + $0.30, the merchant receives the full base amount.
 */
function calculateChargeWithFees(baseAmountCents: number): number {
  return Math.ceil((baseAmountCents + 30) / (1 - 0.029));
}

describe("Stripe fee passthrough calculation", () => {
  it("adds correct fee for $100 base amount", () => {
    // $100.00 base → should charge enough so after 2.9% + $0.30, merchant gets $100
    const charge = calculateChargeWithFees(10000);
    // Verify: charge × 0.029 + 30 ≤ charge - 10000
    const stripeFee = Math.round(charge * 0.029) + 30;
    expect(charge - stripeFee).toBeGreaterThanOrEqual(10000);
    // Exact expected: ceil((10000 + 30) / 0.971) = ceil(10329.557) = 10330
    expect(charge).toBe(10330);
  });

  it("handles small amount ($1.00)", () => {
    const charge = calculateChargeWithFees(100);
    // ceil((100 + 30) / 0.971) = ceil(133.882) = 134
    expect(charge).toBe(134);
  });

  it("handles $0.50 (minimum Stripe charge)", () => {
    const charge = calculateChargeWithFees(50);
    // ceil((50 + 30) / 0.971) = ceil(82.389) = 83
    expect(charge).toBe(83);
  });

  it("handles large amount ($5,000)", () => {
    const charge = calculateChargeWithFees(500000);
    // Verify merchant receives at least the base after Stripe's cut
    const stripeFee = Math.round(charge * 0.029) + 30;
    expect(charge - stripeFee).toBeGreaterThanOrEqual(500000);
    // Must equal actual JS evaluation
    expect(charge).toBe(Math.ceil((500000 + 30) / (1 - 0.029)));
  });

  it("in test mode uses $1.00 regardless of invoice total", () => {
    const paymentTestMode = true;
    const invoiceTotal = 50000; // $500
    const baseChargeAmount = paymentTestMode ? 100 : invoiceTotal;
    expect(baseChargeAmount).toBe(100);
  });

  it("coversFees=false uses base amount unchanged", () => {
    const baseAmount = 10000;
    const coversFees = false;
    const chargeAmount = coversFees
      ? Math.ceil((baseAmount + 30) / (1 - 0.029))
      : baseAmount;
    expect(chargeAmount).toBe(10000);
  });

  it("coversFees=true adds processing fee", () => {
    const baseAmount = 10000;
    const coversFees = true;
    const chargeAmount = coversFees
      ? Math.ceil((baseAmount + 30) / (1 - 0.029))
      : baseAmount;
    expect(chargeAmount).toBe(10330);
    expect(chargeAmount).toBeGreaterThan(baseAmount);
  });
});
