/**
 * In-memory sliding-window rate limiter.
 *
 * LIMITATION: This rate limiter uses a process-local Map, so limits are
 * per-instance. In multi-instance deployments (e.g., multiple Vercel
 * serverless function instances), each instance tracks its own counters
 * independently — a client could exceed the intended limit by hitting
 * different instances. This is acceptable for the current single-region
 * deployment but should be replaced with a distributed store (e.g.,
 * @upstash/ratelimit + Redis, or a Supabase RPC counter) before scaling
 * to multiple concurrent instances.
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
