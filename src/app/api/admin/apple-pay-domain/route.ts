import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeForMode } from "@/lib/stripe/config";

/**
 * POST: Register a domain for Apple Pay with Stripe
 * GET: List registered Apple Pay domains
 *
 * Admin-only endpoint.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("eckcm_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!userRow || !["SUPER_ADMIN", "ADMIN"].includes(userRow.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { domainName, mode = "live" } = await request.json();
  if (!domainName) {
    return NextResponse.json({ error: "domainName is required" }, { status: 400 });
  }

  try {
    const stripe = await getStripeForMode(mode as "test" | "live");
    const domain = await stripe.applePayDomains.create({
      domain_name: domainName,
    });

    return NextResponse.json({
      success: true,
      domain: { id: domain.id, domainName: domain.domain_name, livemode: domain.livemode },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("eckcm_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (!userRow || !["SUPER_ADMIN", "ADMIN"].includes(userRow.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const stripe = await getStripeForMode("live");
    const domains = await stripe.applePayDomains.list({ limit: 100 });

    return NextResponse.json({
      domains: domains.data.map((d) => ({
        id: d.id,
        domainName: d.domain_name,
        livemode: d.livemode,
        created: d.created,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
