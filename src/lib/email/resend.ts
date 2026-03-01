import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

let resendClient: Resend | null = null;
let cachedApiKey: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getResendApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now - cacheTime < CACHE_TTL) {
    return cachedApiKey;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("eckcm_app_config")
      .select("resend_api_key")
      .eq("id", 1)
      .single();

    if (data?.resend_api_key) {
      const key = data.resend_api_key;
      cachedApiKey = key;
      cacheTime = now;
      return key;
    }
  } catch {
    // Fall through to env var
  }

  // Fallback to env var
  if (process.env.RESEND_API_KEY) {
    cachedApiKey = process.env.RESEND_API_KEY;
    cacheTime = now;
    return cachedApiKey;
  }

  throw new Error("Resend API key is not configured. Set it in Admin > Email Settings or via RESEND_API_KEY env var.");
}

export async function getResendClient(): Promise<Resend> {
  const apiKey = await getResendApiKey();

  // If key changed, recreate client
  if (resendClient && cachedApiKey === apiKey) {
    return resendClient;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/** Clear cached client and API key (call after key updates) */
export function clearResendCache(): void {
  resendClient = null;
  cachedApiKey = null;
  cacheTime = 0;
}
