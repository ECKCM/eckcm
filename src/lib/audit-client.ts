/**
 * Client-side audit logging helper.
 * Fire-and-forget — never throws, never blocks the main operation.
 */
export async function logActivity(entry: {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  new_data?: Record<string, unknown> | null;
  event_id?: string | null;
}): Promise<void> {
  try {
    await fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  } catch {
    // Intentionally silent — audit failure must never block the user
  }
}

/**
 * Auth event logging (login/logout) — callable by any authenticated user.
 */
export async function logAuthEvent(
  action: "USER_LOGIN" | "USER_LOGOUT" | "OAUTH_LOGIN",
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch("/api/auth/login-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, metadata }),
    });
  } catch {
    // Intentionally silent
  }
}
