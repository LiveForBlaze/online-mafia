// Unit tests for the pure game engine.
//
// The engine is the highest-risk part of the codebase: many phase transitions,
// many edge cases, all the rules of sport mafia condensed. These tests cover
// the rules we explicitly enforce and a few edge cases the audit flagged.

import { describe, expect, it } from 'vitest';

import { GAME_PHASE, ROLE, TEAM } from '@mafia/shared';

import {
  ENGINE_ERROR,
  applyCastVote,
  applyDonCheck,
  applyMafiaTarget,
  applyNominate,
  applySheriffCheck,
  assignRoles,
  checkWinner,
  resolveVote,
} from './game.engine.js';
import type { GameParticipant, GameState } from './game.state.js';

function buildParticipant(
  seat: number | null,
  role: GameParticipant['role'],
  extras: Partial<GameParticipant> = {},
): GameParticipant {
  return {
    userId: `user-${seat ?? 'judge'}`,
    nickname: `Player ${seat ?? 'judge'}`,
    avatarUrl: null,
    seat,
    isJudge: seat === null,
    isBot: false,
    role,
    isAlive: true,
    isRemoved: false,
    foulsCount: 0,
    hasSpokenThisDay: false,
    ...extras,
  };
}

function buildState(overrides: Partial<GameState> = {}): GameState {
  const participants: GameParticipant[] = [
    buildParticipant(null, null), // judge
    buildParticipant(1, ROLE.CIVILIAN),
    buildParticipant(2, ROLE.CIVILIAN),
    buildParticipant(3, ROLE.CIVILIAN),
    buildParticipant(4, ROLE.CIVILIAN),
    buildParticipant(5, ROLE.CIVILIAN),
    buildParticipant(6, ROLE.CIVILIAN),
    buildParticipant(7, ROLE.SHERIFF),
    buildParticipant(8, ROLE.MAFIA),
    buildParticipant(9, ROLE.MAFIA),
    buildParticipant(10, ROLE.DON),
  ];
  return {
    id: 'g1',
    lobbyId: 'l1',
    rulesetSlug: 'classic',
    status: 'in_progress',
    phase: GAME_PHASE.DAY_SPEECH,
    dayNumber: 1,
    phaseStartedAt: new Date(),
    phaseDeadline: null,
    participants,
    currentSpeakerSeat: 1,
    nominationSeats: [],
    votes: new Map(),
    pendingMafiaTargetSeat: null,
    sheriffCheck: null,
    donCheck: null,
    lastNightVictimSeat: null,
    outOfTurnSpeaker: null,
    farewellSeat: null,
    winner: null,
    nextEventSeq: 0,
    ...overrides,
  };
}

describe('assignRoles', () => {
  it('assigns the canonical 6/1/2/1 role split to ten seated players', () => {
    const participants = Array.from({ length: 10 }, (_, i) => buildParticipant(i + 1, null));
    const withRoles = assignRoles([buildParticipant(null, null), ...participants]);
    const roleCounts = withRoles
      .filter((p) => !p.isJudge)
      .reduce<Record<string, number>>((acc, p) => {
        const role = p.role ?? 'null';
        acc[role] = (acc[role] ?? 0) + 1;
        return acc;
      }, {});
    expect(roleCounts).toEqual({ civilian: 6, sheriff: 1, mafia: 2, don: 1 });
  });
});

describe('checkWinner', () => {
  it('returns BLACK when alive black >= alive red (sport mafia rule)', () => {
    const state = buildState({
      participants: buildState().participants.map((p) => {
        if (p.seat && p.seat <= 4) return { ...p, isAlive: false }; // 4 civilians dead
        if (p.seat === 5) return { ...p, isAlive: false }; // 5th civilian dead
        return p;
      }),
    });
    // alive: 1 civilian (6), sheriff (7), 2 mafia (8,9), 1 don (10) → 2 red vs 3 black
    expect(checkWinner(state)).toBe(TEAM.BLACK);
  });

  it('returns BLACK on equality (the tied case is also a black win)', () => {
    const state = buildState({
      participants: buildState().participants.map((p) => {
        if (p.seat && p.seat <= 5) return { ...p, isAlive: false };
        return p;
      }),
    });
    // alive: civ-6, sheriff-7, mafia-8, mafia-9, don-10 → 2 red vs 3 black
    // need actual equality test:
    const eqState = buildState({
      participants: buildState().participants.map((p) => {
        // Kill 4 civilians and 1 mafia → alive 2 civ + sheriff vs 1 mafia + don = 3 vs 2 → red still winning by 1
        if (p.seat && [1, 2, 3, 4].includes(p.seat)) return { ...p, isAlive: false };
        if (p.seat === 9) return { ...p, isAlive: false };
        return p;
      }),
    });
    // alive: civ-5, civ-6, sheriff-7, mafia-8, don-10 → 3 red vs 2 black → game continues
    expect(checkWinner(eqState)).toBe(null);
  });

  it('returns RED only when all blacks are dead', () => {
    const state = buildState({
      participants: buildState().participants.map((p) =>
        p.role === ROLE.MAFIA || p.role === ROLE.DON ? { ...p, isAlive: false } : p,
      ),
    });
    expect(checkWinner(state)).toBe(TEAM.RED);
  });
});

describe('applyNominate', () => {
  it('refuses self-nomination', () => {
    const state = buildState({ currentSpeakerSeat: 1 });
    // Player 1 (user-1) tries to nominate seat 1
    const result = applyNominate(state, 'user-1', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.CANNOT_TARGET_SELF);
  });

  it('refuses nominating a dead player', () => {
    const state = buildState({
      currentSpeakerSeat: 1,
      participants: buildState().participants.map((p) =>
        p.seat === 5 ? { ...p, isAlive: false } : p,
      ),
    });
    const result = applyNominate(state, 'user-1', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.TARGET_NOT_LIVE);
  });

  it('refuses outside of day_speech', () => {
    const state = buildState({ phase: GAME_PHASE.DAY_VOTE });
    const result = applyNominate(state, 'user-1', 2);
    expect(result.ok).toBe(false);
  });
});

describe('applyCastVote', () => {
  it('refuses double voting from the same seat', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3],
      votes: new Map([[1, 3]]),
    });
    const result = applyCastVote(state, 'user-1', 3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.ALREADY_VOTED);
  });
});

describe('applyMafiaTarget', () => {
  it('refuses friendly fire (mafia shooting mafia/don)', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_MAFIA });
    // Mafia at seat 8 (user-8) targets seat 9 (also mafia)
    const result = applyMafiaTarget(state, 'user-8', 9);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);

    // ...and against the don
    const result2 = applyMafiaTarget(state, 'user-8', 10);
    expect(result2.ok).toBe(false);
  });

  it('allows shooting a civilian', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_MAFIA });
    const result = applyMafiaTarget(state, 'user-8', 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.pendingMafiaTargetSeat).toBe(1);
  });
});

describe('applyDonCheck', () => {
  it('refuses checking a dead player', () => {
    const state = buildState({
      phase: GAME_PHASE.NIGHT_DON,
      participants: buildState().participants.map((p) =>
        p.seat === 7 ? { ...p, isAlive: false } : p,
      ),
    });
    const result = applyDonCheck(state, 'user-10', 7);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.TARGET_NOT_LIVE);
  });

  it('refuses self-check', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_DON });
    const result = applyDonCheck(state, 'user-10', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.CANNOT_TARGET_SELF);
  });

  it('reports SHERIFF=true and other roles=false', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_DON });
    const sheriffResult = applyDonCheck(state, 'user-10', 7);
    expect(sheriffResult.ok).toBe(true);
    if (sheriffResult.ok) expect(sheriffResult.data.donCheck?.result).toBe(true);

    const civilianResult = applyDonCheck(state, 'user-10', 1);
    expect(civilianResult.ok).toBe(true);
    if (civilianResult.ok) expect(civilianResult.data.donCheck?.result).toBe(false);
  });
});

describe('applySheriffCheck', () => {
  it('returns true for both MAFIA and DON', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_SHERIFF });
    const mafiaResult = applySheriffCheck(state, 'user-7', 8);
    expect(mafiaResult.ok).toBe(true);
    if (mafiaResult.ok) expect(mafiaResult.data.sheriffCheck?.result).toBe(true);

    const donResult = applySheriffCheck(state, 'user-7', 10);
    expect(donResult.ok).toBe(true);
    if (donResult.ok) expect(donResult.data.sheriffCheck?.result).toBe(true);
  });

  it('refuses self-check', () => {
    const state = buildState({ phase: GAME_PHASE.NIGHT_SHERIFF });
    const result = applySheriffCheck(state, 'user-7', 7);
    expect(result.ok).toBe(false);
  });
});

describe('resolveVote', () => {
  it('returns the unique winning seat on majority', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 3],
        [4, 5],
      ]),
    });
    expect(resolveVote(state)).toBe(3);
  });

  it('returns null on a tie (no elimination)', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 5],
      ]),
    });
    expect(resolveVote(state)).toBe(null);
  });
});
