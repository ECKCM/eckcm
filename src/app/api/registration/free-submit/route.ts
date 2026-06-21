import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeSubmitSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { generateEPassToken } from "@/lib/services/epass.service";
import { recalculateInventorySafe } from "@/lib/services/inventory.service";
import { syncRegistration } from "@/lib/services/google-sheets.service";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Free ($0) registration submit.
 *
 * Transitions DRAFT → SUBMITTED for registrations with no amount due.
 * Mirrors the zelle/check-submit shape, minus the payment record (nothing to track).
 * Admin reviews and moves to APPROVED (the $0-equivalent terminal status).
 *
 * Idempotent: returns success if already SUBMITTED/APPROVED.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = rateLimit(`free-submit:${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = freeSubmitSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { registrationId } = parsed.data;

    const admin = createAdminClient();

    const { data: registration } = await admin
      .from("eckcm_registrations")
      .select("id, status, created_by_user_id, total_amount_cents, event_id, confirmation_code")
      .eq("id", registrationId)
      .single();

    if (!registration) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    if (registration.created_by_user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (registration.status === "SUBMITTED" || registration.status === "APPROVED") {
      return NextResponse.json({ status: "already_submitted" });
    }
    if (registration.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Registration is not submittable in status ${registration.status}` },
        { status: 409 }
      );
    }
    if (registration.total_amount_cents !== 0) {
      return NextResponse.json(
        { error: "Registration has a non-zero balance and requires payment" },
        { status: 409 }
      );
    }

    // Admin-only registration gate. Block non-staff from finalizing a $0
    // registration into SUBMITTED while the event is locked to staff.
    const { data: eventRow } = await admin
      .from("eckcm_events")
      .select("admin_only_registration")
      .eq("id", registration.event_id)
      .single();
    if (eventRow?.admin_only_registration && !(await requireAdmin())) {
      return NextResponse.json(
        { error: "Registration is currently restricted to staff" },
        { status: 403 }
      );
    }

    // Atomic guard: only update if still DRAFT
    const { data: updated, error: regError } = await admin
      .from("eckcm_registrations")
      .update({ status: "SUBMITTED" })
      .eq("id", registrationId)
      .eq("status", "DRAFT")
      .select("id")
      .maybeSingle();

    if (regError) {
      logger.error("[registration/free-submit] Failed to update registration", {
        registrationId,
        error: String(regError),
      });
      return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
    }

    if (!updated) {
      // Lost the race — someone else moved it. Idempotent success.
      return NextResponse.json({ status: "already_submitted" });
    }

    // Settle the invoice — $0 is fully paid by definition.
    await admin
      .from("eckcm_invoices")
      .update({ status: "SUCCEEDED", paid_at: new Date().toISOString() })
      .eq("registration_id", registrationId)
      .neq("status", "SUCCEEDED");

    // Generate inactive E-Pass tokens (admin activates on APPROVED transition)
    const { data: memberships } = await admin
      .from("eckcm_group_memberships")
      .select("person_id, eckcm_groups!inner(registration_id)")
      .eq("eckcm_groups.registration_id", registrationId);

    let tokensGenerated = 0;
    if (memberships && memberships.length > 0) {
      const personIds = memberships.map((m) => m.person_id);
      const { data: existingTokens } = await admin
        .from("eckcm_epass_tokens")
        .select("person_id")
        .eq("registration_id", registrationId)
        .in("person_id", personIds);

      const existingSet = new Set((existingTokens ?? []).map((t) => t.person_id));
      const newTokens = memberships
        .filter((m) => !existingSet.has(m.person_id))
        .map((m) => {
          const { token, tokenHash } = generateEPassToken();
          return {
            person_id: m.person_id,
            registration_id: registrationId,
            token,
            token_hash: tokenHash,
            is_active: false,
          };
        });

      if (newTokens.length > 0) {
        const { error: insertError } = await admin.from("eckcm_epass_tokens").insert(newTokens);
        if (insertError) {
          logger.error("[registration/free-submit] Failed to insert epass tokens", {
            error: String(insertError),
          });
        } else {
          tokensGenerated = newTokens.length;
        }
      }
    }

    await admin.from("eckcm_audit_logs").insert({
      user_id: user.id,
      action: "FREE_REGISTRATION_SUBMITTED",
      entity_type: "registration",
      entity_id: registrationId,
      new_data: {
        confirmation_code: registration.confirmation_code,
        epass_tokens_generated: tokensGenerated,
      },
    });

    after(async () => {
      try {
        await recalculateInventorySafe(admin);
      } catch (err) {
        logger.error("[registration/free-submit] Inventory recalc failed", { error: String(err) });
      }
      try {
        await syncRegistration(registration.event_id, registrationId);
      } catch (err) {
        logger.error("[registration/free-submit] Google Sheets sync failed", { error: String(err) });
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[registration/free-submit] Unhandled error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
