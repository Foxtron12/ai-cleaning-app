/**
 * Simple in-memory rate limiter for authenticated API routes.
 *
 * Limits requests per (key, namespace) tuple. Intended for low-throughput
 * abuse prevention (e.g. message spam) on a single Next.js instance — for
 * multi-region distributed limits, swap this for a Redis-backed implementation.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

// Cleanup stale entries every minute. Skipped in environments where the
// global setInterval is not available (e.g. Edge runtime); harmless if missed.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const store of stores.values()) {
      for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key)
      }
    }
  }, 60_000).unref?.()
}

function getStore(namespace: string): Map<string, RateLimitEntry> {
  let store = stores.get(namespace)
  if (!store) {
    store = new Map()
    stores.set(namespace, store)
  }
  return store
}

/**
 * Check whether a key in a given namespace has exceeded the configured limit.
 *
 * @param namespace logical bucket (e.g. 'messages-post')
 * @param key per-user identifier (e.g. user.id)
 * @param limit max requests within the window
 * @param windowMs sliding window in milliseconds
 * @returns object with `limited` (true if rate-limited) and `retryAfterSec`
 */
export function checkRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): { limited: boolean; retryAfterSec: number } {
  const store = getStore(namespace)
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { limited: false, retryAfterSec: 0 }
  }

  entry.count++
  if (entry.count > limit) {
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }
  return { limited: false, retryAfterSec: 0 }
}
