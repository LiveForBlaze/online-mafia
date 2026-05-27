import { describe, expect, it } from 'vitest';

import { computeCountdown } from './useCountdown.js';

const BASE = Date.parse('2026-01-01T00:00:00.000Z');

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('computeCountdown', () => {
  it('returns no-timer state when deadline is null', () => {
    expect(computeCountdown(null, null, BASE)).toEqual({
      secondsLeft: 0,
      expired: false,
      hasTimer: false,
      warning: false,
    });
  });

  it('shows exactly the phase duration at the moment the phase starts', () => {
    const startedAt = iso(BASE);
    const deadline = iso(BASE + 60_000);
    const r = computeCountdown(deadline, startedAt, BASE);
    expect(r.secondsLeft).toBe(60);
    expect(r.expired).toBe(false);
  });

  it('caps at phase duration when the client clock lags behind the server', () => {
    // Client computes Date.now() ~100 ms behind the server's clock at the
    // moment the phase started. Without the cap, ceil(60.1s) = 61 and the
    // timer briefly shows "1:01" — the very bug we are fixing.
    const startedAt = iso(BASE);
    const deadline = iso(BASE + 60_000);
    const r = computeCountdown(deadline, startedAt, BASE - 100);
    expect(r.secondsLeft).toBe(60);
  });

  it('ticks down each whole second', () => {
    const startedAt = iso(BASE);
    const deadline = iso(BASE + 60_000);
    expect(computeCountdown(deadline, startedAt, BASE + 30_000).secondsLeft).toBe(30);
    expect(computeCountdown(deadline, startedAt, BASE + 59_500).secondsLeft).toBe(1);
    expect(computeCountdown(deadline, startedAt, BASE + 60_000).secondsLeft).toBe(0);
  });

  it('marks expired and clamps secondsLeft at 0 past the deadline', () => {
    const startedAt = iso(BASE);
    const deadline = iso(BASE + 60_000);
    const r = computeCountdown(deadline, startedAt, BASE + 70_000);
    expect(r.secondsLeft).toBe(0);
    expect(r.expired).toBe(true);
  });

  it('flags warning in the final 10 seconds', () => {
    const startedAt = iso(BASE);
    const deadline = iso(BASE + 60_000);
    expect(computeCountdown(deadline, startedAt, BASE + 49_500).warning).toBe(false);
    expect(computeCountdown(deadline, startedAt, BASE + 50_500).warning).toBe(true);
    expect(computeCountdown(deadline, startedAt, BASE + 60_001).warning).toBe(false);
  });

  it('still works without startedAt (no cap, falls back to original behaviour)', () => {
    const deadline = iso(BASE + 60_000);
    expect(computeCountdown(deadline, null, BASE).secondsLeft).toBe(60);
    expect(computeCountdown(deadline, null, BASE + 30_000).secondsLeft).toBe(30);
  });
});
