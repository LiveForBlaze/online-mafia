// Periodic background sweeper that closes stale WAITING lobbies.
//
// Run every SWEEP_INTERVAL_MS via setInterval. Mirrors the bot-ticker
// pattern in game.bots.ts (single module-level handle, unref'd so it doesn't
// keep the process alive on its own, started/stopped from the module
// entry point via Fastify onClose).
//
// Why polling and not a "schedule one-shot timer per lobby on create"?
// — Survives process restarts (a per-lobby timer would die with the
//   process and orphan the lobby until next manual close).
// — Trivial: one interval, one SQL query, no per-lobby state to track.
// — At 5min cadence with ≤100 tables, the load is negligible.

import { logger } from '../../lib/logger.js';

import { expireStaleLobbies } from './lobby.service.js';

const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let interval: NodeJS.Timeout | null = null;

export function startLobbySweeper(): void {
  if (interval) return;
  interval = setInterval(() => {
    void sweep();
  }, SWEEP_INTERVAL_MS);
  interval.unref();
}

export function stopLobbySweeper(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

async function sweep(): Promise<void> {
  try {
    const closed = await expireStaleLobbies();
    if (closed.length > 0) {
      logger.info({ count: closed.length, ids: closed }, 'lobby sweeper: closed stale lobbies');
    }
  } catch (error) {
    // Sweeper must never crash the process. The next tick will retry.
    logger.error({ err: error }, 'lobby sweeper: sweep failed');
  }
}
