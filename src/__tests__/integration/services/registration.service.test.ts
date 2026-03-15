import { describe, it, expect, vi } from "vitest";
import {
  cancelRegistration,
  deleteDraftRegistration,
} from "@/lib/services/registration.service";

// -- Helpers --

function mockSupabaseForCancel(
  reg: Record<string, unknown> | null,
  regError: unknown = null,
  updateError: unknown = null
) {
  const updateMock = vi.fn(() => ({
    eq: vi.fn(() => ({ error: updateError })),
  }));
  const epassUpdateMock = vi.fn(() => ({
    eq: vi.fn(() => ({ error: null })),
  }));

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "eckcm_registrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => ({ data: reg, error: regError })),
            })),
          })),
          update: updateMock,
        };
      }
      if (table === "eckcm_epass_tokens") {
        return { update: epassUpdateMock };
      }
      return {};
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  return { supabase, updateMock, epassUpdateMock };
}

// -- Tests --

describe("cancelRegistration", () => {
  const userId = "user-1";
  const registrationId = "reg-1";

  it("cancels a valid registration", async () => {
    const { supabase, updateMock, epassUpdateMock } = mockSupabaseForCancel({
      id: registrationId,
      created_by_user_id: userId,
      status: "PAID",
      event_id: "event-1",
    });

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
      reason: "Changed plans",
    });

    expect(result.success).toBe(true);
    expect(updateMock).toHaveBeenCalled();
    expect(epassUpdateMock).toHaveBeenCalled();
  });

  it("returns error when registration not found", async () => {
    const { supabase } = mockSupabaseForCancel(null, {
      message: "not found",
    });

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Registration not found");
  });

  it("returns error when user does not own registration", async () => {
    const { supabase } = mockSupabaseForCancel({
      id: registrationId,
      created_by_user_id: "other-user",
      status: "PAID",
      event_id: "event-1",
    });

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authorized to cancel this registration");
  });

  it("returns error when already cancelled", async () => {
    const { supabase } = mockSupabaseForCancel({
      id: registrationId,
      created_by_user_id: userId,
      status: "CANCELLED",
      event_id: "event-1",
    });

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Registration is already cancelled");
  });

  it("returns error when already refunded", async () => {
    const { supabase } = mockSupabaseForCancel({
      id: registrationId,
      created_by_user_id: userId,
      status: "REFUNDED",
      event_id: "event-1",
    });

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Registration is already refunded");
  });

  it("returns error when update fails", async () => {
    const { supabase } = mockSupabaseForCancel(
      {
        id: registrationId,
        created_by_user_id: userId,
        status: "PAID",
        event_id: "event-1",
      },
      null,
      { message: "update failed" }
    );

    const result = await cancelRegistration(supabase, {
      registrationId,
      userId,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to cancel registration");
  });
});

describe("deleteDraftRegistration", () => {
  it("deletes all related records in correct order", async () => {
    const deletedTables: string[] = [];

    const admin = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            if (table === "eckcm_invoices")
              return { data: [{ id: "inv-1" }], error: null };
            if (table === "eckcm_groups")
              return { data: [{ id: "grp-1" }], error: null };
            if (table === "eckcm_group_memberships")
              return {
                data: [{ person_id: "person-1" }],
                error: null,
              };
            return { data: [], error: null };
          }),
          in: vi.fn(() => {
            if (table === "eckcm_group_memberships")
              return {
                data: [{ person_id: "person-1" }],
                error: null,
              };
            return { data: [], error: null };
          }),
        })),
        delete: vi.fn(() => {
          deletedTables.push(table);
          return {
            eq: vi.fn(() => ({ data: null, error: null })),
            in: vi.fn(() => ({ data: null, error: null })),
          };
        }),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await deleteDraftRegistration(admin, "reg-1");

    // Verify cascading delete order: children before parents
    expect(deletedTables).toContain("eckcm_invoice_line_items");
    expect(deletedTables).toContain("eckcm_payments");
    expect(deletedTables).toContain("eckcm_invoices");
    expect(deletedTables).toContain("eckcm_group_memberships");
    expect(deletedTables).toContain("eckcm_registration_rides");
    expect(deletedTables).toContain("eckcm_epass_tokens");
    expect(deletedTables).toContain("eckcm_groups");
    expect(deletedTables).toContain("eckcm_people");
    expect(deletedTables).toContain("eckcm_registrations");

    // Registration should be deleted last
    const regIdx = deletedTables.indexOf("eckcm_registrations");
    const lineItemIdx = deletedTables.indexOf("eckcm_invoice_line_items");
    expect(regIdx).toBeGreaterThan(lineItemIdx);
  });

  it("handles empty invoices gracefully", async () => {
    const admin = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => {
            if (table === "eckcm_groups")
              return { data: [{ id: "grp-1" }], error: null };
            if (table === "eckcm_group_memberships")
              return {
                data: [{ person_id: "person-1" }],
                error: null,
              };
            return { data: [], error: null }; // no invoices
          }),
          in: vi.fn(() => {
            if (table === "eckcm_group_memberships")
              return {
                data: [{ person_id: "person-1" }],
                error: null,
              };
            return { data: [], error: null };
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ data: null, error: null })),
          in: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    // Should not throw even with no invoices
    await expect(deleteDraftRegistration(admin, "reg-1")).resolves.toBeUndefined();
  });

  it("handles null data from queries", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ data: null, error: null })),
          in: vi.fn(() => ({ data: null, error: null })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ data: null, error: null })),
          in: vi.fn(() => ({ data: null, error: null })),
        })),
      })),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await expect(deleteDraftRegistration(admin, "reg-1")).resolves.toBeUndefined();
  });
});
