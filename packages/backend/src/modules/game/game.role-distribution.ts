// ROLE_DISTRIBUTION card pick — the per-seat pick action, its server-side
// auto-pick fallback timer, and the bot/timeout auto-pick.

import { GAME_PHASE } from '@mafia/shared';

import { withLock } from '../../lib/mutex.js';
import { broadcastGameState } from './game.broadcast.js';
import { applyRoleCardPick } from './game.engine.js';
import { getGame } from './game.registry.js';
import { type GameState } from './game.state.js';
import {
  BOT_PICK_DELAY_MS,
  GAME_EVENT_TYPE,
  PICK_TIMEOUT_MS,
  clearPickTimer,
  commit,
  fail,
  loadGameForUser,
  ok,
  persistEvent,
  pickTimers,
  type ActionContext,
  type ServiceResult,
} from './game.service.internal.js';

/** Schedule the auto-pick fallback for the seat that's currently picking.
 *  Re-scheduling is idempotent: each call cancels the previous timer first. */
export function schedulePickTimer(gameId: string, expectedPickerSeat: number): void {
  clearPickTimer(gameId);
  const state = getGame(gameId);
  const picker = state?.participants.find((p) => p.seat === expectedPickerSeat);
  const isBot = picker?.isBot ?? false;
  const t = setTimeout(
    () => {
      void autoPickRoleCard(gameId, expectedPickerSeat, isBot);
    },
    isBot ? BOT_PICK_DELAY_MS : PICK_TIMEOUT_MS,
  );
  pickTimers.set(gameId, t);
}

async function autoPickRoleCard(
  gameId: string,
  expectedPickerSeat: number,
  randomize: boolean,
): Promise<void> {
  const state = getGame(gameId);
  if (!state) return;
  if (state.phase !== GAME_PHASE.ROLE_DISTRIBUTION) return;
  if (state.roleCardPickerSeat !== expectedPickerSeat) return;
  const picker = state.participants.find((p) => p.seat === expectedPickerSeat);
  if (!picker) return;
  const taken = new Set(state.roleCardsPicked);
  const available: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    if (!taken.has(i)) available.push(i);
  }
  if (available.length === 0) return;
  // Bots pick at random for that "I'm choosing" illusion; human timeouts
  // get the first available card as documented for the player.
  const cardIndex = randomize
    ? available[Math.floor(Math.random() * available.length)]!
    : available[0]!;
  const result = await pickRoleCard({ gameId, userId: picker.userId }, cardIndex, true);
  // Auto-picks bypass the gateway's respondAndBroadcast, so we have to push
  // the new state to the room ourselves — otherwise other clients keep
  // showing the bot/timeout's seat as still picking until they reload.
  if (result.ok) broadcastGameState(gameId);
}

export async function pickRoleCard(
  ctx: ActionContext,
  cardIndex: number,
  auto = false,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyRoleCardPick(loaded.data.state, ctx.userId, cardIndex);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    const seat = loaded.data.state.roleCardPickerSeat;
    next = await persistEvent(next, GAME_EVENT_TYPE.ROLE_CARD_PICKED, ctx.userId, {
      cardIndex,
      seat,
      auto,
    });
    const committed = await commit(next);
    // Restart the timer for the next picker, or clear it when picks are done.
    if (committed.roleCardPickerSeat !== null) {
      schedulePickTimer(ctx.gameId, committed.roleCardPickerSeat);
    } else {
      clearPickTimer(ctx.gameId);
    }
    return ok(committed);
  });
}
