import { createHash } from "crypto";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMealPassUrl } from "@/lib/services/meal-pass.service";
import { MealPassViewer } from "./meal-pass-viewer";

export const dynamic = "force-dynamic";

/**
 * Public read-only viewer for a disposable meal pass (/m/{token}). Lets a buyer
 * reopen their QR and see remaining uses. Resolves the pass by sha256(token)
 * via the admin client — the raw token is never queried directly.
 */
export default async function MealPassPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const admin = createAdminClient();
  const { data: pass } = await admin
    .from("eckcm_meal_passes")
    .select("token, status, uses_total, uses_consumed, tier_code, payer_name")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!pass) notFound();

  const usesRemaining = Math.max(
    0,
    (pass.uses_total as number) - (pass.uses_consumed as number)
  );

  return (
    <MealPassViewer
      redeemUrl={buildMealPassUrl(pass.token as string)}
      status={pass.status as string}
      usesTotal={pass.uses_total as number}
      usesRemaining={usesRemaining}
      tierCode={pass.tier_code as string | null}
      payerName={pass.payer_name as string | null}
    />
  );
}
