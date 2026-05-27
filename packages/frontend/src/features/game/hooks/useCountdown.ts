// Countdown timer tied to a server-provided deadline (ISO string).
//
// We re-render the consuming component every 500 ms while a deadline is active.
// Returns the remaining whole seconds and an `expired` flag. When deadline is
// null (lobby, game_over, etc.) the hook produces a stable "no timer" result.

import { useEffect, useState } from 'react';

interface CountdownResult {
  secondsLeft: number;
  expired: boolean;
  hasTimer: boolean;
  /** True когда осталось ≤ 10 сек и таймер ещё не истёк — UI показывает жёлтым. */
  warning: boolean;
}

/**
 * Pure computation of countdown state from a deadline and the server-reported
 * phase start. Exposed for unit tests.
 *
 * The phase start is used to cap `secondsLeft` at the phase's intended
 * duration. Without the cap, a client whose clock runs slightly behind the
 * server's would compute `remainingMs > duration` at the moment the phase
 * begins, and `Math.ceil(60100 / 1000) = 61` makes the timer briefly display
 * "1:01" before falling to "1:00". Capping at `deadline - startedAt` prevents
 * any displayed value from exceeding the actual phase length.
 */
export function computeCountdown(
  deadlineIso: string | null,
  startedAtIso: string | null,
  nowMs: number,
): CountdownResult {
  if (!deadlineIso) {
    return { secondsLeft: 0, expired: false, hasTimer: false, warning: false };
  }
  const deadlineMs = new Date(deadlineIso).getTime();
  const remainingMs = deadlineMs - nowMs;
  const durationMs = startedAtIso ? deadlineMs - new Date(startedAtIso).getTime() : Infinity;
  const cappedMs = Math.min(remainingMs, durationMs);
  const secondsLeft = Math.max(0, Math.ceil(cappedMs / 1000));
  const expired = remainingMs <= 0;
  return {
    secondsLeft,
    expired,
    hasTimer: true,
    warning: !expired && secondsLeft <= 10,
  };
}

export function useCountdown(
  deadlineIso: string | null,
  startedAtIso: string | null = null,
): CountdownResult {
  // Ticking state — incremented every 500 ms to force a re-render. We don't store
  // the actual remaining time in state because deriving it from `Date.now()` on
  // every render avoids drift between the React tick and the wall clock.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadlineIso) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return computeCountdown(deadlineIso, startedAtIso, Date.now());
}

/** Format a positive seconds value as M:SS for display. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
