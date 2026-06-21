/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Used by endpoints that bypass Supabase's built-in captcha layer (e.g. the
 * custom forgot-password flow that sends recovery emails via Resend rather
 * than Supabase). The widget already runs on the client; this re-checks the
 * token against Cloudflare so a stolen/forged token can't be replayed.
 *
 * Returns ok:true when verification passes OR when turnstile is intentionally
 * disabled (no secret configured, or app_config.turnstile_enabled=false). Set
 * TURNSTILE_SECRET_KEY in env to enable enforcement.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerifyResult {
  ok: boolean;
  /** Present when verification ran and failed. */
  error?: string;
}

export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { ok: true };
  }

  if (!token) {
    return { ok: false, error: "Missing captcha token" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return {
      ok: false,
      error: `Captcha verification failed: ${(data["error-codes"] ?? []).join(", ") || "unknown"}`,
    };
  } catch (err) {
    return { ok: false, error: `Captcha verification failed: ${String(err)}` };
  }
}
