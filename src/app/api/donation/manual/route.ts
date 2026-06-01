import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { donationManualSchema } from "@/lib/schemas/api";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const GENERAL_FUND = "Camp Meeting (General)";

// Donation method → eckcm_payment_method enum value.
// "CASH" maps to ONSITE (pay at the registration desk); the human label is
// preserved in metadata.donation_method.
const METHOD_TO_ENUM: Record<"ZELLE" | "CHECK" | "CASH", "ZELLE" | "CHECK" | "ONSITE"> = {
  ZELLE: "ZELLE",
  CHECK: "CHECK",
  CASH: "ONSITE",
};

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = rateLimit(`donation-manual:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = donationManualSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { amountCents, donorName, donorEmail, method, departmentId } = parsed.data;
    const admin = createAdminClient();

    // Resolve designation: department name (if chosen) or the general fund.
    let designation = GENERAL_FUND;
    if (departmentId) {
      const { data: dept } = await admin
        .from("eckcm_departments")
        .select("name_en")
        .eq("id", departmentId)
        .eq("is_active", true)
        .single();
      designation = dept?.name_en ?? GENERAL_FUND;
    }

    const { data: donation, error: insertError } = await admin
      .from("eckcm_donations")
      .insert({
        donor_name: donorName || null,
        donor_email: donorEmail || null,
        amount_cents: amountCents,
        fee_cents: 0,
        covers_fees: false,
        payment_method: METHOD_TO_ENUM[method],
        status: "PENDING",
        metadata: {
          designation,
          ...(departmentId ? { departmentId } : { fund: "camp_meeting" }),
          donation_method: method, // ZELLE | CHECK | CASH (human label)
          submitted_via: "donation_form",
        },
      })
      .select("id")
      .single();

    if (insertError || !donation) {
      logger.error("[donation/manual] Failed to insert donation", {
        error: insertError?.message ?? "no data returned",
      });
      return NextResponse.json(
        { error: "Failed to record donation" },
        { status: 500 }
      );
    }

    logger.info("[donation/manual] Pending donation recorded", {
      donationId: donation.id,
      method,
    });

    return NextResponse.json({ donationId: donation.id });
  } catch (err) {
    logger.error("[donation/manual] Unhandled error", { error: String(err) });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
