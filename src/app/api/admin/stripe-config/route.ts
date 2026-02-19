import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type StripeKeyField =
  | "stripe_test_publishable_key"
  | "stripe_test_secret_key"
  | "stripe_live_publishable_key"
  | "stripe_live_secret_key";

const STRIPE_KEY_FIELDS: StripeKeyField[] = [
  "stripe_test_publishable_key",
  "stripe_test_secret_key",
  "stripe_live_publishable_key",
  "stripe_live_secret_key",
];

function maskKey(key: string | null): { is_set: boolean; last4: string } {
  if (!key) return { is_set: false, last4: "" };
  return { is_set: true, last4: key.slice(-4) };
}

async function checkSuperAdmin(userId: string) {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("eckcm_staff_assignments")
    .select("id, eckcm_roles(name)")
    .eq("user_id", userId)
    .eq("is_active", true);

  return assignments?.some(
    (a) =>
      a.eckcm_roles &&
      (a.eckcm_roles as unknown as { name: string }).name === "SUPER_ADMIN"
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkSuperAdmin(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("eckcm_app_config")
    .select(
      "stripe_test_publishable_key, stripe_test_secret_key, stripe_live_publishable_key, stripe_live_secret_key"
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
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await checkSuperAdmin(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

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
    if (field.includes("secret") && !value.startsWith("sk_")) {
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

  // Audit log (mask secret keys)
  const auditData: Record<string, string> = {};
  for (const [field, value] of Object.entries(updates)) {
    auditData[field] = field.includes("secret")
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
