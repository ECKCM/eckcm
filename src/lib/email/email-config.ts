import { createAdminClient } from "@/lib/supabase/admin";

interface EmailConfig {
  fromName: string;
  fromAddress: string;
  from: string;
  replyTo?: string;
}

let cachedConfig: EmailConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export async function getEmailConfig(): Promise<EmailConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("eckcm_app_config")
      .select("email_from_name, email_from_address, email_reply_to")
      .eq("id", 1)
      .single();

    const fromName = data?.email_from_name || process.env.EMAIL_FROM_NAME || "ECKCM";
    const fromAddress = data?.email_from_address || "noreply@my.eckcm.com";

    cachedConfig = {
      fromName,
      fromAddress,
      from: `${fromName} <${fromAddress}>`,
      replyTo: data?.email_reply_to || undefined,
    };
    cacheTime = now;
    return cachedConfig;
  } catch {
    // Fallback to env var
    const fallback = process.env.EMAIL_FROM || "ECKCM <noreply@my.eckcm.com>";
    return {
      fromName: "ECKCM",
      fromAddress: "noreply@my.eckcm.com",
      from: fallback,
    };
  }
}

/** Clear the cache (useful after config updates) */
export function clearEmailConfigCache(): void {
  cachedConfig = null;
  cacheTime = 0;
}
