// Bot AI for game participants flagged as isBot.
//
// A single interval scans every active game, finds bot players that can act in the
// current phase, and performs a random-but-valid move for them. The aim is just to
// keep the game moving for testing — there is no strategy, no bluffing, no realism.
//
// Why a ticker instead of subscribing to events? Simplicity. State changes happen
// from many places (REST start, WS actions); polling every 1.5s catches them all
// without coupling the service layer to a pub/sub.

import { GAME_PHASE, ROLE } from '@mafia/shared';

import { activeGameIds, getGame } from './game.registry.js';
import { broadcastGameState } from './game.broadcast.js';
import { checkAsDon, checkAsSheriff, chooseMafiaTarget } from './game.service.js';
import { alivePlayers, type GameParticipant, type GameState } from './game.state.js';

const TICK_INTERVAL_MS = 1500;
// Tracks bots that have an action in flight so the next tick does not double-fire.
const inFlight = new Set<string>();

let interval: NodeJS.Timeout | null = null;

export function startBotTicker(): void {
  if (interval) return;
  interval = setInterval(() => {
    tick().catch(() => {
      /* swallow — bot logic must never crash the process */
    });
  }, TICK_INTERVAL_MS);
  // Don't keep the Node process alive on its own.
  interval.unref();
}

export function stopBotTicker(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

async function tick(): Promise<void> {
  for (const gameId of activeGameIds()) {
    const state = getGame(gameId);
    if (!state || state.status === 'finished') continue;

    for (const bot of state.participants) {
      if (!bot.isBot || bot.isJudge || !bot.isAlive || bot.isRemoved) continue;
      const key = `${gameId}:${bot.userId}:${state.phase}`;
      if (inFlight.has(key)) continue;
      const action = decideAction(state, bot);
      if (!action) continue;
      inFlight.add(key);
      try {
        await action();
        broadcastGameState(gameId);
      } finally {
        inFlight.delete(key);
      }
    }
  }
}

/**
 * Decide what the bot should do in the current phase, or return null if it has no
 * valid move. The decision picks a random target subject to "don't shoot your own team".
 */
function decideAction(state: GameState, bot: GameParticipant): (() => Promise<unknown>) | null {
  const ctx = { gameId: state.id, userId: bot.userId };

  switch (state.phase) {
    case GAME_PHASE.NIGHT_MAFIA: {
      // All three black-team seats (two mafia + don) cast the kill ballot.
      // Each bot votes once per night under the consensus rule. With
      // multiple shooters picking independently their picks will usually
      // disagree → miss; the kill only lands when they happen to align.
      // That's the correct emergent behaviour, not a bug.
      if (bot.role !== ROLE.MAFIA && bot.role !== ROLE.DON) return null;
      if (bot.seat !== null && state.mafiaVotes.has(bot.seat)) return null;
      const target = pickRandomLivingSeat(state, {
        excludeRoles: [ROLE.MAFIA, ROLE.DON],
        excludeUserId: bot.userId,
      });
      if (target === null) return null;
      return () => chooseMafiaTarget(ctx, target);
    }

    case GAME_PHASE.NIGHT_DON: {
      if (bot.role !== ROLE.DON) return null;
      if (state.donCheck) return null;
      const target = pickRandomLivingSeat(state, {
        excludeRoles: [ROLE.MAFIA, ROLE.DON],
        excludeUserId: bot.userId,
      });
      if (target === null) return null;
      return () => checkAsDon(ctx, target);
    }

    case GAME_PHASE.NIGHT_SHERIFF: {
      if (bot.role !== ROLE.SHERIFF) return null;
      if (state.sheriffCheck) return null;
      const target = pickRandomLivingSeat(state, { excludeUserId: bot.userId });
      if (target === null) return null;
      return () => checkAsSheriff(ctx, target);
    }

    // Bots intentionally never cast a day vote. Per ФИИМ "те кто не
    // проголосовал — за последнего", any voter who skips through the
    // sequential rounds gets auto-cast for the last candidate at the
    // moment the judge passes the last round (applyNextSpeaker in the
    // engine). Letting bots vote randomly was the simplest possible
    // ticker behaviour but it produced unpredictable tallies during
    // testing — disabling it makes the auto-cast rule the deterministic
    // source of bot voting behaviour.
    default:
      return null;
  }
}

interface PickFilter {
  excludeRoles?: ReadonlyArray<string>;
  excludeUserId?: string;
}

function pickRandomLivingSeat(state: GameState, filter: PickFilter): number | null {
  const candidates = alivePlayers(state).filter((p) => {
    if (filter.excludeUserId && p.userId === filter.excludeUserId) return false;
    if (filter.excludeRoles && p.role && filter.excludeRoles.includes(p.role)) return false;
    if (p.seat === null) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const winner = candidates[Math.floor(Math.random() * candidates.length)]!;
  return winner.seat;
}
