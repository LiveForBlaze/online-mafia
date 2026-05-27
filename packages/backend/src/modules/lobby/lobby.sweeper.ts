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
import { prisma } from '../../db/prisma.client.js';

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

  try {
    const orphans = await cleanupOrphanBots();
    if (orphans > 0) {
      logger.info({ count: orphans }, 'lobby sweeper: removed orphan bots');
    }
  } catch (error) {
    logger.error({ err: error }, 'lobby sweeper: orphan bot cleanup failed');
  }
}

// Боты-«сироты»: isBot=true И не сидят ни в одном активном лобби
// (WAITING/IN_GAME) И не участники активной (не endedAt) игры. После
// конца партии cleanupBotsAfterGame удаляет ботов сразу; этот sweep —
// safety net на случай, если процесс упал между finalize и cleanup,
// или для исторических ботов накопившихся до релиза cleanup'а.
async function cleanupOrphanBots(): Promise<number> {
  const orphans = await prisma.user.findMany({
    where: {
      isBot: true,
      lobbyMembers: { none: { lobby: { status: { in: ['WAITING', 'IN_GAME'] } } } },
      gamesAsParticipant: { none: { game: { endedAt: null } } },
    },
    select: { id: true },
    take: 200, // ограничиваем чтобы один проход не выжрал DB на больших накоплениях
  });
  if (orphans.length === 0) return 0;
  const ids = orphans.map((o) => o.id);
  await prisma.$transaction(async (tx) => {
    await tx.gameEvent.updateMany({
      where: { actorId: { in: ids } },
      data: { actorId: null },
    });
    await tx.gameParticipant.deleteMany({ where: { userId: { in: ids } } });
    await tx.lobbyMember.deleteMany({ where: { userId: { in: ids } } });
    await tx.user.deleteMany({ where: { id: { in: ids }, isBot: true } });
  });
  return ids.length;
}
