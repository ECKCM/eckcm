import { randomBytes, createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Absolute site origin (mirrors src/app/layout.tsx). */
export function getPaymentLinkOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export type EnsurePaymentLinkResult =
  | { ok: true; url: string; token: string; reused: boolean; eventId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Look up an existing, non-expired card-payment link for a registration WITHOUT
 * creating one. Returns null when no token exists or it has expired. Used by the
 * admin UI to show whether a link is already active.
 */
export async function getExistingPaymentLink(
  registrationId: string
): Promise<{ url: string; status: string } | null> {
  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("eckcm_registrations")
    .select("status, payment_link_token, payment_link_expires_at")
    .eq("id", registrationId)
    .single();

  if (!reg || !reg.payment_link_token) return null;

  const expired =
    reg.payment_link_expires_at &&
    new Date(reg.payment_link_expires_at).getTime() <= Date.now();
  if (expired) return null;

  return {
    url: `${getPaymentLinkOrigin()}/pay/${reg.payment_link_token}`,
    status: reg.status,
  };
}

/**
 * Generate (or reuse) a secure self-service card-payment link for a SUBMITTED
 * (Zelle/Check/Onsite) registration. The registrant opens the link with no login
 * and pays by card at full price.
 *
 * Reuses the existing, non-expired token so the SAME link stays stable across
 * repeated requests — clicking "Create" again (or emailing the link) never
 * invalidates a link already handed to the payer.
 *
 * See submitted-card-payment-link.design.md.
 */
export async function ensurePaymentLinkToken(
  registrationId: string
): Promise<EnsurePaymentLinkResult> {
  const admin = createAdminClient();

  const { data: registration } = await admin
    .from("eckcm_registrations")
    .select("id, status, event_id, payment_link_token, payment_link_expires_at")
    .eq("id", registrationId)
    .single();

  if (!registration) {
    return { ok: false, status: 404, error: "Registration not found" };
  }

  if (registration.status !== "SUBMITTED") {
    return {
      ok: false,
      status: 409,
      error: `Card payment link is only available for SUBMITTED registrations (current: ${registration.status})`,
    };
  }

  const baseUrl = getPaymentLinkOrigin();

  const existingValid =
    registration.payment_link_token &&
    (!registration.payment_link_expires_at ||
      new Date(registration.payment_link_expires_at).getTime() > Date.now());

  if (existingValid) {
    return {
      ok: true,
      url: `${baseUrl}/pay/${registration.payment_link_token}`,
      token: registration.payment_link_token as string,
      reused: true,
      eventId: registration.event_id,
    };
  }

  // Generate a fresh, unguessable token; store raw (for admin re-copy) + hash (for lookup).
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error: updateError } = await admin
    .from("eckcm_registrations")
    .update({
      payment_link_token: token,
      payment_link_token_hash: tokenHash,
      payment_link_created_at: new Date().toISOString(),
      payment_link_expires_at: null,
    })
    .eq("id", registrationId);

  if (updateError) {
    logger.error("[payment-link] Failed to store token", {
      registrationId,
      error: String(updateError),
    });
    return { ok: false, status: 500, error: "Failed to create payment link" };
  }

  return {
    ok: true,
    url: `${baseUrl}/pay/${token}`,
    token,
    reused: false,
    eventId: registration.event_id,
  };
}
