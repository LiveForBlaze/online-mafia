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
}

export function useCountdown(deadlineIso: string | null): CountdownResult {
  // Ticking state — incremented every 500 ms to force a re-render. We don't store
  // the actual remaining time in state because deriving it from `Date.now()` on
  // every render avoids drift between the React tick and the wall clock.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!deadlineIso) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [deadlineIso]);

  if (!deadlineIso) {
    return { secondsLeft: 0, expired: false, hasTimer: false };
  }
  const remainingMs = new Date(deadlineIso).getTime() - Date.now();
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  return { secondsLeft, expired: remainingMs <= 0, hasTimer: true };
}

/** Format a positive seconds value as M:SS for display. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
