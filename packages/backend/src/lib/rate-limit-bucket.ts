// Fixed-window rate-limit bucket logic, extracted from the Socket.IO plugin so
// the decision is unit-testable in isolation (the plugin itself needs a live IO
// server). Pure except for the in/out mutation of the shared `buckets` map.

export interface RateBucket {
  count: number;
  resetAt: number;
}

/**
 * Record one request against `key` and decide whether it's allowed.
 *
 * Fixed-window semantics: the first request in a window starts a fresh bucket
 * that expires at `now + windowMs`; subsequent requests in that window increment
 * the count and are allowed while `count <= limit`. An expired bucket (or none)
 * is treated as a fresh window. Mutates `buckets`.
 *
 * @returns true if the request is allowed, false if it exceeds `limit`.
 */
export function consumeRateLimit(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  now: number,
  windowMs: number,
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

/**
 * Drop every bucket whose window has already elapsed (`resetAt <= now`). Used by
 * the periodic sweeper to keep the map from growing on long-lived connections.
 *
 * @returns the number of buckets removed.
 */
export function sweepExpiredBuckets(buckets: Map<string, RateBucket>, now: number): number {
  let removed = 0;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) {
      buckets.delete(k);
      removed += 1;
    }
  }
  return removed;
}
