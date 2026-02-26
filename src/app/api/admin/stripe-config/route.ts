import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearStripeCache } from "@/lib/stripe/config";
import { requireSuperAdmin } from "@/lib/auth/admin";

type StripeKeyField =
  | "stripe_test_publishable_key"
  | "stripe_test_secret_key"
  | "stripe_live_publishable_key"
  | "stripe_live_secret_key"
  | "stripe_test_webhook_secret"
  | "stripe_live_webhook_secret";

const STRIPE_KEY_FIELDS: StripeKeyField[] = [
  "stripe_test_publishable_key",
  "stripe_test_secret_key",
  "stripe_live_publishable_key",
  "stripe_live_secret_key",
  "stripe_test_webhook_secret",
  "stripe_live_webhook_secret",
];

function maskKey(key: string | null): { is_set: boolean; last4: string } {
  if (!key) return { is_set: false, last4: "" };
  return { is_set: true, last4: key.slice(-4) };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select(
      "stripe_test_publishable_key, stripe_test_secret_key, stripe_live_publishable_key, stripe_live_secret_key, stripe_test_webhook_secret, stripe_live_webhook_secret, enabled_payment_methods, deduct_stripe_fees_on_refund, donor_covers_fees_registration, donor_covers_fees_donation"
    )
    .eq("id", 1)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Failed to fetch Stripe config" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    stripe_test_publishable_key: maskKey(data.stripe_test_publishable_key),
    stripe_test_secret_key: maskKey(data.stripe_test_secret_key),
    stripe_live_publishable_key: maskKey(data.stripe_live_publishable_key),
    stripe_live_secret_key: maskKey(data.stripe_live_secret_key),
    stripe_test_webhook_secret: maskKey(data.stripe_test_webhook_secret),
    stripe_live_webhook_secret: maskKey(data.stripe_live_webhook_secret),
    enabled_payment_methods: data.enabled_payment_methods ?? ["card", "ach", "zelle", "wallet", "more"],
    deduct_stripe_fees_on_refund: data.deduct_stripe_fees_on_refund ?? false,
    donor_covers_fees_registration: data.donor_covers_fees_registration ?? false,
    donor_covers_fees_donation: data.donor_covers_fees_donation ?? false,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { user } = auth;

  const body = await request.json();

  // Handle deduct_stripe_fees_on_refund toggle
  if ("deduct_stripe_fees_on_refund" in body) {
    if (typeof body.deduct_stripe_fees_on_refund !== "boolean") {
      return NextResponse.json(
        { error: "deduct_stripe_fees_on_refund must be a boolean" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("eckcm_app_config")
      .update({ deduct_stripe_fees_on_refund: body.deduct_stripe_fees_on_refund })
      .eq("id", 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update refund fee setting" },
        { status: 500 }
      );
    }

    await admin.from("eckcm_audit_logs").insert({
      user_id: user.id,
      action: "UPDATE_STRIPE_CONFIG",
      entity_type: "app_config",
      entity_id: "1",
      new_data: { deduct_stripe_fees_on_refund: body.deduct_stripe_fees_on_refund },
    });

    return NextResponse.json({ success: true, deduct_stripe_fees_on_refund: body.deduct_stripe_fees_on_refund });
  }

  // Handle donor_covers_fees toggles
  const DONOR_FEE_FIELDS = ["donor_covers_fees_registration", "donor_covers_fees_donation"] as const;
  for (const field of DONOR_FEE_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `${field} must be a boolean` },
          { status: 400 }
        );
      }

      const admin = createAdminClient();
      const { error } = await admin
        .from("eckcm_app_config")
        .update({ [field]: body[field] })
        .eq("id", 1);

      if (error) {
        return NextResponse.json(
          { error: `Failed to update ${field}` },
          { status: 500 }
        );
      }

      await admin.from("eckcm_audit_logs").insert({
        user_id: user.id,
        action: "UPDATE_STRIPE_CONFIG",
        entity_type: "app_config",
        entity_id: "1",
        new_data: { [field]: body[field] },
      });

      return NextResponse.json({ success: true, [field]: body[field] });
    }
  }

  // Handle payment methods update
  const VALID_METHODS = ["card", "ach", "zelle", "check", "wallet", "more"];
  if (Array.isArray(body.enabled_payment_methods)) {
    const methods = body.enabled_payment_methods.filter((m: string) =>
      VALID_METHODS.includes(m)
    );

    const admin = createAdminClient();
    const { error } = await admin
      .from("eckcm_app_config")
      .update({ enabled_payment_methods: methods })
      .eq("id", 1);

    if (error) {
      return NextResponse.json(
        { error: "Failed to update payment methods" },
        { status: 500 }
      );
    }

    await admin.from("eckcm_audit_logs").insert({
      user_id: user.id,
      action: "UPDATE_PAYMENT_METHODS",
      entity_type: "app_config",
      entity_id: "1",
      new_data: { enabled_payment_methods: methods },
    });

    return NextResponse.json({ success: true, enabled_payment_methods: methods });
  }

  // Only allow known Stripe key fields
  const updates: Partial<Record<StripeKeyField, string>> = {};
  for (const field of STRIPE_KEY_FIELDS) {
    if (typeof body[field] === "string" && body[field].trim()) {
      updates[field] = body[field].trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid Stripe keys provided" },
      { status: 400 }
    );
  }

  // Basic key format validation
  for (const [field, value] of Object.entries(updates)) {
    if (field.includes("publishable") && !value.startsWith("pk_")) {
      return NextResponse.json(
        { error: `${field} must start with pk_` },
        { status: 400 }
      );
    }
    if (field.includes("webhook_secret") && !value.startsWith("whsec_")) {
      return NextResponse.json(
        { error: `${field} must start with whsec_` },
        { status: 400 }
      );
    }
    if (field.includes("secret_key") && !value.startsWith("sk_")) {
      return NextResponse.json(
        { error: `${field} must start with sk_` },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("eckcm_app_config")
    .update(updates)
    .eq("id", 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to update Stripe config" },
      { status: 500 }
    );
  }

  // Invalidate cached Stripe instances so new keys take effect
  clearStripeCache();

  // Audit log (mask secret keys)
  const auditData: Record<string, string> = {};
  for (const [field, value] of Object.entries(updates)) {
    auditData[field] = (field.includes("secret") || field.includes("webhook"))
      ? `****${value.slice(-4)}`
      : value;
  }

  await admin.from("eckcm_audit_logs").insert({
    user_id: user.id,
    action: "UPDATE_STRIPE_CONFIG",
    entity_type: "app_config",
    entity_id: "1",
    new_data: auditData,
  });

  return NextResponse.json({ success: true });
}
