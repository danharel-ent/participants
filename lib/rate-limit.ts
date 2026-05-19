/**
 * In-memory sliding-window rate limiter.
 * תקין ל-instance בודד; ב-multi-instance prod עדיף Redis (אופציה למטה).
 */

type Bucket = { hits: number[]; updatedAt: number };

const MEMORY_KEY = "__participants_rate_limit__";

function buckets(): Map<string, Bucket> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[MEMORY_KEY]) g[MEMORY_KEY] = new Map<string, Bucket>();
  return g[MEMORY_KEY] as Map<string, Bucket>;
}

/**
 * @returns null if allowed, or seconds-until-retry if blocked.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number; remaining: 0 } {
  const now = Date.now();
  const map = buckets();
  const bucket = map.get(key) ?? { hits: [], updatedAt: now };

  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfterMs = windowMs - (now - oldest);
    bucket.updatedAt = now;
    map.set(key, bucket);
    return { ok: false, retryAfterSec: Math.ceil(retryAfterMs / 1000), remaining: 0 };
  }

  bucket.hits.push(now);
  bucket.updatedAt = now;
  map.set(key, bucket);

  // periodic GC
  if (map.size > 500) {
    for (const [k, b] of map) {
      if (now - b.updatedAt > windowMs * 4) map.delete(k);
    }
  }

  return { ok: true };
}

export function clientFingerprint(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anon";
  return ip;
}
