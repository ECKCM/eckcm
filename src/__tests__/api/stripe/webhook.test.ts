import { describe, it, expect, vi, beforeEach } from "vitest";

// -- Module mocks (must be before imports) --

const mockAdminFrom = vi.fn();
const mockAdmin = { from: mockAdminFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

const mockConstructEvent = vi.fn();
const mockStripe = {
  webhooks: { constructEvent: mockConstructEvent },
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
    after: vi.fn((fn: () => void) => fn()), // Execute immediately in tests
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { POST } from "@/app/api/stripe/webhook/route";

// -- Helpers --

function makeRequest(body: string, signature = "sig_test") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

function setupAppConfig(config: Record<string, unknown> | null = {}) {
  const defaultConfig = {
    stripe_test_secret_key: "sk_test_xxx",
    stripe_live_secret_key: "sk_live_xxx",
    stripe_test_webhook_secret: "whsec_test",
    stripe_live_webhook_secret: "whsec_live",
    ...config,
  };

  return defaultConfig;
}

function makeSucceededEvent(metadata: Record<string, string> = {}) {
  return {
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test123",
        metadata: {
          registrationId: "reg-1",
          invoiceId: "inv-1",
          userId: "user-1",
          ...metadata,
        },
        payment_method: "pm_card",
        latest_charge: "ch_test123",
      },
    },
  };
}

function makeFailedEvent(metadata: Record<string, string> = {}) {
  return {
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: "pi_test_fail",
        metadata: {
          registrationId: "reg-1",
          invoiceId: "inv-1",
          ...metadata,
        },
        payment_method: "pm_card",
        last_payment_error: { message: "Bank declined" },
      },
    },
  };
}

// -- Tests --

describe("Stripe webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when signature header is missing", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      // No stripe-signature header
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing signature");
  });

  it("returns 500 when app config not found", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(500);
  });

  it("returns 400 when signature verification fails for all modes", async () => {
    const config = setupAppConfig();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      return {};
    });

    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid signature");
  });

  it("processes payment_intent.succeeded — upgrades SUBMITTED to PAID", async () => {
    const config = setupAppConfig();
    const event = makeSucceededEvent();

    mockConstructEvent.mockReturnValue(event);

    // Track what tables get updated
    const updates: Record<string, unknown>[] = [];

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: "reg-1", status: "SUBMITTED" },
                error: null,
              })),
            })),
          })),
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_payments") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_invoices") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_group_memberships") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [{ person_id: "person-1" }],
              error: null,
            })),
          })),
        };
      }
      if (table === "eckcm_epass_tokens") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({ data: [], error: null })),
            })),
          })),
          insert: vi.fn(() => ({ error: null })),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const regUpdate = updates.find((u) => u.table === "eckcm_registrations");
    expect(regUpdate?.data).toEqual({ status: "PAID" });

    const paymentUpdate = updates.find((u) => u.table === "eckcm_payments");
    expect((paymentUpdate?.data as Record<string, unknown>)?.status).toBe("SUCCEEDED");
  });

  it("skips processing when registration is already PAID (idempotent)", async () => {
    const config = setupAppConfig();
    const event = makeSucceededEvent();

    mockConstructEvent.mockReturnValue(event);

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: "reg-1", status: "PAID" },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => {
            throw new Error("Should not update already-paid registration");
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it("acknowledges event without metadata registrationId", async () => {
    const config = setupAppConfig();
    const event = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_external",
          metadata: {}, // no registrationId
        },
      },
    };

    mockConstructEvent.mockReturnValue(event);

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it("processes payment_intent.payment_failed — does NOT cancel registration, only updates payment/invoice", async () => {
    const config = setupAppConfig();
    const event = makeFailedEvent();

    mockConstructEvent.mockReturnValue(event);

    const updates: Record<string, unknown>[] = [];

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: "reg-1", status: "SUBMITTED" },
                error: null,
              })),
            })),
          })),
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_payments") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_invoices") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    // Registration should NOT be cancelled — payment_failed must never cancel registrations
    const regUpdate = updates.find((u) => u.table === "eckcm_registrations");
    expect(regUpdate).toBeUndefined();

    const payUpdate = updates.find((u) => u.table === "eckcm_payments");
    expect((payUpdate?.data as Record<string, unknown>)?.status).toBe("FAILED");

    const invUpdate = updates.find((u) => u.table === "eckcm_invoices");
    expect((invUpdate?.data as Record<string, unknown>)?.status).toBe("FAILED");
  });

  it("ignores payment_failed when registration is already PAID (late webhook)", async () => {
    const config = setupAppConfig();
    const event = makeFailedEvent();

    mockConstructEvent.mockReturnValue(event);

    const updates: Record<string, unknown>[] = [];

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: { id: "reg-1", status: "PAID" },
                error: null,
              })),
            })),
          })),
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_payments") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      if (table === "eckcm_invoices") {
        return {
          update: vi.fn((data: unknown) => {
            updates.push({ table, data });
            return { eq: vi.fn(() => ({ data: null, error: null })) };
          }),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);

    // No tables should be updated — PAID registration is protected
    expect(updates).toHaveLength(0);
  });

  it("acknowledges unhandled event types", async () => {
    const config = setupAppConfig();
    const event = {
      type: "charge.refunded",
      data: { object: { id: "ch_test" } },
    };

    mockConstructEvent.mockReturnValue(event);

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "eckcm_app_config") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: config, error: null })),
            })),
          })),
        };
      }
      return {};
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });
});
