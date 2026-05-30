import { describe, expect, it } from 'vitest';

import { consumeRateLimit, sweepExpiredBuckets, type RateBucket } from './rate-limit-bucket.js';

const WINDOW = 10_000;

function freshMap() {
  return new Map<string, RateBucket>();
}

describe('consumeRateLimit', () => {
  it('allows the first request and opens a window', () => {
    const buckets = freshMap();
    expect(consumeRateLimit(buckets, 'u:e', 3, 1_000, WINDOW)).toBe(true);
    expect(buckets.get('u:e')).toEqual({ count: 1, resetAt: 1_000 + WINDOW });
  });

  it('allows requests up to and including the limit, then rejects', () => {
    const buckets = freshMap();
    // limit = 3: calls 1..3 allowed, 4th rejected — all within the same window.
    expect(consumeRateLimit(buckets, 'k', 3, 0, WINDOW)).toBe(true); // count 1
    expect(consumeRateLimit(buckets, 'k', 3, 1, WINDOW)).toBe(true); // count 2
    expect(consumeRateLimit(buckets, 'k', 3, 2, WINDOW)).toBe(true); // count 3
    expect(consumeRateLimit(buckets, 'k', 3, 3, WINDOW)).toBe(false); // count 4 > 3
    expect(consumeRateLimit(buckets, 'k', 3, 4, WINDOW)).toBe(false); // stays rejected
  });

  it('starts a fresh window once the previous one has elapsed', () => {
    const buckets = freshMap();
    consumeRateLimit(buckets, 'k', 1, 0, WINDOW); // count 1, resetAt = WINDOW
    expect(consumeRateLimit(buckets, 'k', 1, 1, WINDOW)).toBe(false); // over limit, same window
    // At exactly resetAt the window is considered expired (resetAt <= now).
    expect(consumeRateLimit(buckets, 'k', 1, WINDOW, WINDOW)).toBe(true);
    expect(buckets.get('k')).toEqual({ count: 1, resetAt: WINDOW + WINDOW });
  });

  it('isolates buckets per key (different users/events do not share a budget)', () => {
    const buckets = freshMap();
    expect(consumeRateLimit(buckets, 'userA:chat', 1, 0, WINDOW)).toBe(true);
    expect(consumeRateLimit(buckets, 'userA:chat', 1, 0, WINDOW)).toBe(false);
    // A different key is unaffected by userA hitting the limit.
    expect(consumeRateLimit(buckets, 'userB:chat', 1, 0, WINDOW)).toBe(true);
    expect(consumeRateLimit(buckets, 'userA:move', 1, 0, WINDOW)).toBe(true);
  });
});

describe('sweepExpiredBuckets', () => {
  it('removes only buckets whose window has elapsed and reports the count', () => {
    const buckets = freshMap();
    buckets.set('expired1', { count: 5, resetAt: 100 });
    buckets.set('expired2', { count: 1, resetAt: 500 });
    buckets.set('live', { count: 2, resetAt: 5_000 });

    const removed = sweepExpiredBuckets(buckets, 1_000);

    expect(removed).toBe(2);
    expect(buckets.has('expired1')).toBe(false);
    expect(buckets.has('expired2')).toBe(false);
    expect(buckets.has('live')).toBe(true);
  });

  it('treats resetAt === now as expired', () => {
    const buckets = freshMap();
    buckets.set('boundary', { count: 1, resetAt: 1_000 });
    expect(sweepExpiredBuckets(buckets, 1_000)).toBe(1);
    expect(buckets.size).toBe(0);
  });
});
