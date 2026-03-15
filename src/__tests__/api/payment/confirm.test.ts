import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Module mocks --

const mockUserAuth = vi.fn();
const mockSupabase = {
  auth: { getUser: mockUserAuth },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

const mockAdminFrom = vi.fn();
const mockAdmin = { from: mockAdminFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

const mockRetrieve = vi.fn();
const mockStripe = {
  paymentIntents: { retrieve: mockRetrieve },
};

vi.mock("@/lib/stripe/config", () => ({
  getStripeForMode: vi.fn(() => mockStripe),
}));

vi.mock("@/lib/services/epass.service", () => ({
  generateEPassToken: vi.fn(() => ({
    token: "test-token",
    tokenHash: "test-hash",
  })),
}));

vi.mock("@/lib/email/send-confirmation", () => ({
  sendConfirmationEmail: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return {
    ...mod,
    after: vi.fn((fn: () => void) => fn()),
  };
});

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/payment/confirm/route";

// -- Helpers --

const userId = "user-1";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/payment/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupAuthenticatedUser() {
  mockUserAuth.mockResolvedValue({
    data: { user: { id: userId, email: "test@test.com" } },
  });
}

function setupRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-1",
    status: "DRAFT",
    created_by_user_id: userId,
    event_id: "event-1",
    ...overrides,
  };
}

// -- Tests --

describe("POST /api/payment/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthenticatedUser();
  });

  it("returns 401 when not authenticated", async () => {
    mockUserAuth.mockResolvedValue({ data: { user: null } });

    const res = await POST(
      makeRequest({ registrationId: "reg-1", paymentIntentId: "pi_test" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid request body", async () => {
    const res = await POST(makeRequest({ registrationId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when registration not found", async () => {
    mockAdminFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
    }));

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_test",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when user doesn't own registration", async () => {
    const reg = setupRegistration({ created_by_user_id: "other-user" });

    mockAdminFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: reg, error: null })),
        })),
      })),
    }));

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_test",
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns already_confirmed for PAID registration (idempotent)", async () => {
    const reg = setupRegistration({ status: "PAID" });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: null })),
            })),
          })),
        };
      }
      // Mock for generateEPassAndSendEmail inner calls
      if (table === "eckcm_group_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ data: [], error: null })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
            in: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
      };
    });

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_test",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("already_confirmed");
  });

  it("returns 409 for non-DRAFT, non-PAID registration", async () => {
    const reg = setupRegistration({ status: "CANCELLED" });

    mockAdminFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: reg, error: null })),
        })),
      })),
    }));

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_test",
      })
    );
    expect(res.status).toBe(409);
  });

  it("confirms card payment (succeeded) → returns 'confirmed'", async () => {
    const reg = setupRegistration();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "reg-1" }],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "eckcm_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { stripe_mode: "test" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "eckcm_payments") {
        return {
          update: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "pay-1" }],
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "eckcm_invoices") {
        return {
          update: vi.fn(() => ({
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                data: [{ id: "inv-1" }],
                error: null,
              })),
            })),
          })),
        };
      }
      // E-Pass generation mocks
      if (table === "eckcm_group_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ data: [], error: null })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => ({ data: null, error: null })),
            in: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
        insert: vi.fn(() => ({ error: null })),
      };
    });

    // Card payment: status = "succeeded"
    mockRetrieve.mockResolvedValue({
      id: "pi_test",
      status: "succeeded",
      metadata: {
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        userId,
        invoiceId: "inv-1",
      },
      payment_method: "pm_card",
      latest_charge: "ch_test",
    });

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_test",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("confirmed");
  });

  it("handles ACH payment (processing) → returns 'processing'", async () => {
    const reg = setupRegistration();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: null })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
        };
      }
      if (table === "eckcm_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { stripe_mode: "test" },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === "eckcm_payments") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
        };
      }
      if (table === "eckcm_invoices") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ data: null, error: null })),
          })),
        };
      }
      return {};
    });

    // ACH payment: status = "processing"
    mockRetrieve.mockResolvedValue({
      id: "pi_ach",
      status: "processing",
      metadata: {
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        userId,
        invoiceId: "inv-1",
      },
      payment_method: "pm_us_bank",
    });

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_ach",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("processing");
  });

  it("returns 400 when PaymentIntent status is not succeeded/processing", async () => {
    const reg = setupRegistration();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { stripe_mode: "test" },
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    });

    mockRetrieve.mockResolvedValue({
      id: "pi_cancel",
      status: "canceled",
      metadata: {
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        userId,
      },
    });

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_cancel",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when metadata registrationId doesn't match", async () => {
    const reg = setupRegistration();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { stripe_mode: "test" },
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    });

    mockRetrieve.mockResolvedValue({
      id: "pi_mismatch",
      status: "succeeded",
      metadata: {
        registrationId: "different-registration-id",
        userId,
      },
    });

    const res = await POST(
      makeRequest({
        registrationId: "550e8400-e29b-41d4-a716-446655440000",
        paymentIntentId: "pi_mismatch",
      })
    );
    expect(res.status).toBe(400);
  });
});
