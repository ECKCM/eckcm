/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-instance deployments.
 * For multi-instance, replace with @upstash/ratelimit + Redis.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Periodic cleanup to prevent memory leaks (every 60s)
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 60_000);
  // Allow process to exit even if timer is running
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a request is within rate limit.
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  ensureCleanup();

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true };
}
