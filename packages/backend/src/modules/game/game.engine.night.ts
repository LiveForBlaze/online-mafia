// Night actions (mafia kill ballot, don check, sheriff check) plus the
// ROLE_DISTRIBUTION card-pick flow. All pure.

import { GAME_PHASE, ROLE } from '@mafia/shared';

import {
  ENGINE_ERROR,
  fail,
  ok,
  withFreshDeadline,
  type EngineResult,
} from './game.engine.shared.js';
import { alivePlayers, findBySeat, findByUserId, type GameState } from './game.state.js';

export function applyMafiaTarget(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.NIGHT_MAFIA) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
  // All three black-team players (two mafia + don) cast the night kill
  // ballot. Resolution at the end of night requires unanimity across
  // everyone alive on the black team — if any of them disagrees or
  // doesn't vote, the night ends in a miss.
  if (actor.role !== ROLE.MAFIA && actor.role !== ROLE.DON) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
  // Mafia must not shoot their own team — basic rule of the game.
  if (target.role === ROLE.MAFIA || target.role === ROLE.DON) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }

  // Record this shooter's individual vote. Consensus across all alive mafia
  // is computed at resolution time in applyAdvancePhase — if any of them
  // voted for a different seat (or didn't vote at all), nobody dies.
  const newVotes = new Map(state.mafiaVotes);
  newVotes.set(actor.seat!, targetSeat);
  return ok({
    ...state,
    mafiaVotes: newVotes,
    // Last-write mirror so the existing UI keeps highlighting the most recent
    // selection. Once we expose mafiaVotes to the client, this becomes derived
    // and can be dropped from the projection.
    pendingMafiaTargetSeat: targetSeat,
  });
}

// Resolve the night's kill: every alive black-team seat (mafia + don)
// must have voted AND voted for the same target for the kill to land.
// Returns null on miss / no consensus.
export function resolveMafiaConsensus(state: GameState): number | null {
  const shooters = alivePlayers(state).filter((p) => p.role === ROLE.MAFIA || p.role === ROLE.DON);
  if (shooters.length === 0) return null;
  let agreed: number | null = null;
  for (const shooter of shooters) {
    const vote = state.mafiaVotes.get(shooter.seat!);
    if (vote === undefined) return null;
    if (agreed === null) agreed = vote;
    else if (vote !== agreed) return null;
  }
  return agreed;
}

export function applyDonCheck(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.NIGHT_DON) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.role !== ROLE.DON || !actor.isAlive) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }
  // One check per night. Don't let the don rescan and overwrite their first
  // result — that would let them sample multiple targets and the audit log
  // would only remember the final one.
  if (state.donCheck !== null) return fail(ENGINE_ERROR.ALREADY_CHECKED);

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  // ФИИМ: дон может проверять любого, включая мёртвых и дисквалифицированных.
  // Цена проверки — потерянная ночь, но информация о роли всё ещё полезна
  // команде. Самопроверка остаётся бессмысленной — её блокируем.
  if (target.userId === actorUserId) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);

  return ok({
    ...state,
    donCheck: { byUserId: actorUserId, targetSeat, result: target.role === ROLE.SHERIFF },
  });
}

export function applySheriffCheck(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.NIGHT_SHERIFF) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.role !== ROLE.SHERIFF || !actor.isAlive) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }
  // One check per night — same reasoning as don.
  if (state.sheriffCheck !== null) return fail(ENGINE_ERROR.ALREADY_CHECKED);

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  // ФИИМ: шериф может проверять любого, включая мёртвых и дисквалифицированных.
  // Самопроверка отклоняется как бессмысленная.
  if (target.userId === actorUserId) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);

  return ok({
    ...state,
    sheriffCheck: {
      byUserId: actorUserId,
      targetSeat,
      result: target.role === ROLE.MAFIA || target.role === ROLE.DON,
    },
  });
}

// ---- ROLE_DISTRIBUTION card pick ----
//
// Picking is purely cosmetic — each player's role was already rolled by
// assignRoles() at game start. The click selects which one of the remaining
// face-down cards on the visual wall is removed.

export function applyRoleCardPick(
  state: GameState,
  actorUserId: string,
  cardIndex: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.ROLE_DISTRIBUTION) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (cardIndex < 0 || cardIndex > 9) return fail(ENGINE_ERROR.CARD_TAKEN);
  if (state.roleCardsPicked.includes(cardIndex)) return fail(ENGINE_ERROR.CARD_TAKEN);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  if (actor.seat === null) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  if (state.roleCardPickerSeat !== actor.seat) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

  const newPicked = [...state.roleCardsPicked, cardIndex];
  const nextPicker = nextRoleCardPicker(state, actor.seat);
  const next: GameState = {
    ...state,
    roleCardsPicked: newPicked,
    roleCardPickerSeat: nextPicker,
  };
  // Restart the per-pick timer for the next player. When picks are done
  // (nextPicker === null) we leave phaseDeadline alone — the judge still
  // owns the JUDGE_ADVANCE_PHASE click.
  return ok(nextPicker !== null ? withFreshDeadline(next, GAME_PHASE.ROLE_DISTRIBUTION) : next);
}

export function nextRoleCardPicker(state: GameState, fromSeat: number): number | null {
  for (let seat = fromSeat + 1; seat <= 10; seat += 1) {
    const p = state.participants.find((x) => x.seat === seat);
    if (p && !p.isRemoved) return seat;
  }
  return null;
}

export function firstRoleCardPicker(state: GameState): number | null {
  for (let seat = 1; seat <= 10; seat += 1) {
    const p = state.participants.find((x) => x.seat === seat);
    if (p && !p.isRemoved) return seat;
  }
  return null;
}
