import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";
import { verifyAndCheckin } from "@/lib/services/checkin.service";

// -- Helpers --

const TEST_TOKEN = "test-epass-token-value-abc";
const TEST_TOKEN_HASH = createHash("sha256").update(TEST_TOKEN).digest("hex");

function makeEpassData(overrides: Record<string, unknown> = {}) {
  return {
    id: "epass-1",
    person_id: "person-1",
    registration_id: "reg-1",
    is_active: true,
    eckcm_people: {
      first_name_en: "Scott",
      last_name_en: "Kim",
      display_name_ko: "김찬영",
    },
    eckcm_registrations: {
      confirmation_code: "R26KIM0001",
      status: "PAID",
      event_id: "event-1",
      eckcm_events: {
        name_en: "ECKCM Summer Camp 2026",
        year: 2026,
      },
    },
    ...overrides,
  };
}

function mockSupabaseForCheckin(
  epassData: unknown = makeEpassData(),
  epassError: unknown = null,
  checkinError: unknown = null
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "eckcm_epass_tokens") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({
                data: epassData,
                error: epassError,
              })),
            })),
          })),
        };
      }
      if (table === "eckcm_checkins") {
        return {
          insert: vi.fn(() => ({
            error: checkinError,
          })),
        };
      }
      return {};
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

const baseParams = {
  token: TEST_TOKEN,
  checkinType: "MORNING",
  sessionId: "session-1",
  checkedInBy: "admin-1",
};

// -- Tests --

describe("verifyAndCheckin", () => {
  it("successfully checks in with valid token", async () => {
    const supabase = mockSupabaseForCheckin();

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(200);
    expect(result.status).toBe("checked_in");
    expect(result.person?.name).toBe("Scott Kim");
    expect(result.person?.koreanName).toBe("김찬영");
    expect(result.event?.name).toBe("ECKCM Summer Camp 2026");
    expect(result.confirmationCode).toBe("R26KIM0001");
    expect(result.checkinType).toBe("MORNING");
  });

  it("returns error for invalid token", async () => {
    const supabase = mockSupabaseForCheckin(null, { code: "PGRST116" });

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(404);
    expect(result.status).toBe("error");
    expect(result.error).toBe("Invalid E-Pass token");
  });

  it("returns error when E-Pass is inactive", async () => {
    const supabase = mockSupabaseForCheckin(
      makeEpassData({ is_active: false })
    );

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(403);
    expect(result.status).toBe("error");
    expect(result.error).toBe("E-Pass is inactive");
    expect(result.person?.name).toBe("Scott Kim");
  });

  it("returns error when registration is not PAID", async () => {
    const supabase = mockSupabaseForCheckin(
      makeEpassData({
        eckcm_registrations: {
          confirmation_code: "R26KIM0001",
          status: "SUBMITTED", // not PAID
          event_id: "event-1",
          eckcm_events: { name_en: "Camp", year: 2026 },
        },
      })
    );

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(403);
    expect(result.status).toBe("error");
    expect(result.error).toBe("Registration is not paid");
  });

  it("returns already_checked_in on duplicate (unique constraint 23505)", async () => {
    const supabase = mockSupabaseForCheckin(
      makeEpassData(),
      null,
      { code: "23505", message: "duplicate key" }
    );

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(200);
    expect(result.status).toBe("already_checked_in");
    expect(result.person?.name).toBe("Scott Kim");
    expect(result.event?.name).toBe("ECKCM Summer Camp 2026");
  });

  it("returns 500 on unexpected checkin insert error", async () => {
    const supabase = mockSupabaseForCheckin(
      makeEpassData(),
      null,
      { code: "42000", message: "unknown error" }
    );

    const { result, statusCode } = await verifyAndCheckin(supabase, baseParams);

    expect(statusCode).toBe(500);
    expect(result.status).toBe("error");
    expect(result.error).toBe("Failed to record check-in");
  });

  it("hashes token before querying (verifies SHA-256 lookup)", async () => {
    const fromMock = vi.fn((table: string) => {
      if (table === "eckcm_epass_tokens") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => {
              // Verify the service is querying by hash, not raw token
              if (col === "token_hash") {
                expect(val).toBe(TEST_TOKEN_HASH);
              }
              return {
                single: vi.fn(() => ({
                  data: makeEpassData(),
                  error: null,
                })),
              };
            }),
          })),
        };
      }
      if (table === "eckcm_checkins") {
        return { insert: vi.fn(() => ({ error: null })) };
      }
      return {};
    });

    const supabase = { from: fromMock } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await verifyAndCheckin(supabase, baseParams);

    expect(fromMock).toHaveBeenCalledWith("eckcm_epass_tokens");
  });

  it("handles null sessionId", async () => {
    const insertMock = vi.fn(() => ({ error: null }));
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "eckcm_epass_tokens") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: makeEpassData(),
                  error: null,
                })),
              })),
            })),
          };
        }
        if (table === "eckcm_checkins") {
          return { insert: insertMock };
        }
        return {};
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const { result } = await verifyAndCheckin(supabase, {
      ...baseParams,
      sessionId: null,
    });

    expect(result.status).toBe("checked_in");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: null })
    );
  });
});
