import { describe, it, expect, vi } from "vitest";
import {
  getRefundSummary,
  createRefundWithGuard,
  RefundOverLimitError,
} from "@/lib/services/refund.service";

// -- Helpers --

/**
 * Mock admin client for refund tests.
 *
 * createRefundWithGuard flow:
 *   1. from("eckcm_refunds").insert(...)  — uses insertedId / insertError
 *   2. getRefundSummary → from("eckcm_refunds").select(...)  — uses postInsertRefundRows (if set) or refundRows
 *
 * For standalone getRefundSummary tests, only refundRows is used.
 * For createRefundWithGuard tests that need to trigger the race condition guard,
 * set postInsertRefundRows to a list whose sum > paymentAmountCents.
 */
function mockAdmin(overrides: Record<string, unknown> = {}) {
  const refundRows = (overrides.refundRows as Array<{ amount_cents: number }>) ?? [];
  const insertedId = (overrides.insertedId as string) ?? "refund-1";
  const insertError = (overrides.insertError as unknown) ?? null;
  const postInsertRefundRows = (overrides.postInsertRefundRows as Array<{ amount_cents: number }>) ?? null;

  // Track whether insert has been called to distinguish pre/post-insert selects
  let insertCalled = false;

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "eckcm_refunds") {
        return {
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              order: vi.fn(() => {
                // After insert, use postInsertRefundRows if available
                const rows = insertCalled && postInsertRefundRows
                  ? postInsertRefundRows
                  : refundRows;
                return { data: rows, error: null };
              }),
            };
            return chain;
          }),
          insert: vi.fn(() => {
            insertCalled = true;
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: insertError ? null : { id: insertedId },
                  error: insertError,
                })),
              })),
            };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
        };
      }
      return {};
    }),
  };

  return admin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// -- Tests --

describe("getRefundSummary", () => {
  it("returns zero when no refunds exist", async () => {
    const admin = mockAdmin({ refundRows: [] });
    const result = await getRefundSummary(admin, "pay-1", 10000);

    expect(result.totalRefundedCents).toBe(0);
    expect(result.remainingCents).toBe(10000);
    expect(result.refunds).toEqual([]);
  });

  it("sums existing refund amounts", async () => {
    const admin = mockAdmin({
      refundRows: [
        { amount_cents: 3000, id: "r1", stripe_refund_id: null, reason: null, refunded_by: null, created_at: "" },
        { amount_cents: 2000, id: "r2", stripe_refund_id: null, reason: null, refunded_by: null, created_at: "" },
      ],
    });
    const result = await getRefundSummary(admin, "pay-1", 10000);

    expect(result.totalRefundedCents).toBe(5000);
    expect(result.remainingCents).toBe(5000);
  });

  it("handles null data gracefully", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({ data: null, error: null })),
          })),
        })),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await getRefundSummary(admin, "pay-1", 10000);
    expect(result.totalRefundedCents).toBe(0);
    expect(result.remainingCents).toBe(10000);
  });
});

describe("createRefundWithGuard", () => {
  const baseParams = {
    paymentId: "pay-1",
    paymentAmountCents: 10000,
    amountCents: 3000,
    reason: "Customer requested",
    refundedBy: "admin-1",
  };

  it("inserts refund when within limit", async () => {
    const admin = mockAdmin({
      refundRows: [],
      postInsertRefundRows: [{ amount_cents: 3000 }],
      insertedId: "refund-new",
    });

    const result = await createRefundWithGuard(admin, baseParams);
    expect(result.refundId).toBe("refund-new");
  });

  it("throws RefundOverLimitError when post-insert sum exceeds payment", async () => {
    // Simulate race condition: after insert, total = 12000 > 10000
    const admin = mockAdmin({
      refundRows: [],
      postInsertRefundRows: [
        { amount_cents: 7000 },
        { amount_cents: 5000 }, // concurrent refund
      ],
      insertedId: "refund-race",
    });

    await expect(
      createRefundWithGuard(admin, { ...baseParams, amountCents: 5000 })
    ).rejects.toThrow(RefundOverLimitError);
  });

  it("deletes inserted record on rollback", async () => {
    const deleteMock = vi.fn(() => ({
      eq: vi.fn(() => ({ data: null, error: null })),
    }));

    let insertCalled = false;

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "eckcm_refunds") {
          return {
            select: vi.fn(() => {
              return {
                eq: vi.fn(() => ({
                  order: vi.fn(() => ({
                    data: insertCalled
                      ? [{ amount_cents: 15000 }] // exceeds 10000
                      : [],
                    error: null,
                  })),
                })),
              };
            }),
            insert: vi.fn(() => {
              insertCalled = true;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => ({
                    data: { id: "refund-to-delete" },
                    error: null,
                  })),
                })),
              };
            }),
            delete: deleteMock,
          };
        }
        return {};
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await expect(
      createRefundWithGuard(admin, baseParams)
    ).rejects.toThrow(RefundOverLimitError);

    expect(deleteMock).toHaveBeenCalled();
  });

  it("throws on insert failure", async () => {
    const admin = mockAdmin({
      insertError: { message: "DB error" },
    });

    await expect(
      createRefundWithGuard(admin, baseParams)
    ).rejects.toThrow("Failed to create refund record");
  });

  it("succeeds when total equals payment exactly", async () => {
    // 7000 existing + 3000 new = 10000 == limit → OK
    const admin = mockAdmin({
      refundRows: [],
      postInsertRefundRows: [
        { amount_cents: 7000 },
        { amount_cents: 3000 },
      ],
      insertedId: "refund-exact",
    });

    const result = await createRefundWithGuard(admin, baseParams);
    expect(result.refundId).toBe("refund-exact");
  });
});
