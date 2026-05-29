// Shared engine primitives: result types, error codes, and cross-cutting pure
// helpers used by more than one engine module. Everything here is
// side-effect-free. This module is the dependency root for the engine — the
// other engine modules import from here, never the other way around.

import {
  DEFAULT_PHASE_DURATION_SEC,
  ROLE_TO_TEAM,
  TEAM,
  type GamePhase,
  type Team,
} from '@mafia/shared';

import { alivePlayers, type GameState } from './game.state.js';

/**
 * Stamp a fresh timer onto the state for the current phase / speaker.
 * Called whenever we transition phase or advance to the next speaker.
 * A duration of 0 (lobby / game_over) yields no deadline.
 */
export function withFreshDeadline(state: GameState, phase: GamePhase): GameState {
  const durationSec = DEFAULT_PHASE_DURATION_SEC[phase] ?? 0;
  const now = new Date();
  return {
    ...state,
    phaseStartedAt: now,
    phaseDeadline: durationSec > 0 ? new Date(now.getTime() + durationSec * 1000) : null,
  };
}

// ---- Result types ----

export type EngineResult<T> = { ok: true; data: T } | { ok: false; error: EngineErrorCode };

export const ENGINE_ERROR = {
  WRONG_PHASE: 'wrong_phase',
  NOT_LIVE_PLAYER: 'not_live_player',
  TARGET_NOT_FOUND: 'target_not_found',
  TARGET_NOT_LIVE: 'target_not_live',
  NOT_YOUR_TURN: 'not_your_turn',
  NOT_AUTHORIZED_ROLE: 'not_authorized_role',
  ALREADY_NOMINATED: 'already_nominated',
  ALREADY_VOTED: 'already_voted',
  ALREADY_CHECKED: 'already_checked',
  ALREADY_GUESSED: 'already_guessed',
  ALREADY_PICKED: 'already_picked',
  CARD_TAKEN: 'card_taken',
  INVALID_GUESS: 'invalid_guess',
  GAME_OVER: 'game_over',
  CANNOT_TARGET_SELF: 'cannot_target_self',
  NO_NOMINATIONS_TO_VOTE: 'no_nominations_to_vote',
  PICK_IN_PROGRESS: 'pick_in_progress',
} as const;
export type EngineErrorCode = (typeof ENGINE_ERROR)[keyof typeof ENGINE_ERROR];

export const ok = <T>(data: T): EngineResult<T> => ({ ok: true, data });
export const fail = (error: EngineErrorCode): EngineResult<never> => ({ ok: false, error });

// ---- Win condition ----

export function checkWinner(state: GameState): Team | null {
  const alive = alivePlayers(state);
  const aliveBlack = alive.filter((p) => p.role && ROLE_TO_TEAM[p.role] === TEAM.BLACK).length;
  const aliveRed = alive.filter((p) => p.role && ROLE_TO_TEAM[p.role] === TEAM.RED).length;

  if (aliveBlack === 0) return TEAM.RED;
  if (aliveBlack >= aliveRed) return TEAM.BLACK;
  return null;
}

// ---- Shared mutators ----

export function killSeat(state: GameState, seat: number): GameState {
  return {
    ...state,
    participants: state.participants.map((p) => (p.seat === seat ? { ...p, isAlive: false } : p)),
  };
}

// Each new day starts one seat later than the previous one.
//
// dayNumber is 0-indexed internally: the first DAY_SPEECH runs with
// dayNumber=0 (the morning that follows night 0 hasn't incremented anything
// yet), the second with dayNumber=1, etc. So `dayNumber % 10 + 1` gives:
//   first day  (dayNumber=0)  → seat 1
//   second day (dayNumber=1)  → seat 2
//   …
//   eleventh   (dayNumber=10) → seat 1 again
//
// The previous formula was `(dayNumber - 1) % 10 + 1`, which produced seat 0
// on the first day (invalid) and then accidentally landed on seat 1 via the
// search loop below — but it also returned seat 1 on the second day,
// breaking the rotation rule. Confirmed by the multi-domain engine audit.
//
// If the nominal starting seat is dead/removed, walk clockwise to the next
// alive seat. Returns null if nobody is left.
export function dayStartSeat(state: GameState): number | null {
  const nominal = (state.dayNumber % 10) + 1;
  const alive = alivePlayers(state);
  if (alive.length === 0) return null;
  for (let offset = 0; offset < 10; offset += 1) {
    const seat = ((nominal - 1 + offset) % 10) + 1;
    if (alive.some((p) => p.seat === seat)) return seat;
  }
  return null;
}
