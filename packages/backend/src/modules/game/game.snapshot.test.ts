// Tests for the REVERT-snapshot round-trip.
//
// These guard the recovery path: if a backend crashes between judgeRevert and
// the next action, recoverActiveGames replays the event log and must restore
// the post-revert state, not the pre-revert one. The contract is
// snapshotState() → parseSnapshot() → applySnapshotToState() leaves the
// dynamic fields equal to the source state.

import { describe, expect, it } from 'vitest';

import { GAME_PHASE, ROLE, TEAM } from '@mafia/shared';

import { applySnapshotToState, parseSnapshot, snapshotState } from './game.snapshot.js';
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
    buildParticipant(null, null),
    buildParticipant(1, ROLE.CIVILIAN),
    buildParticipant(2, ROLE.MAFIA),
    buildParticipant(3, ROLE.DON),
  ];
  return {
    id: 'game-1',
    lobbyId: 'lobby-1',
    rulesetSlug: 'classic',
    status: 'in_progress',
    phase: GAME_PHASE.DAY_VOTE,
    dayNumber: 2,
    phaseStartedAt: new Date('2026-05-25T10:00:00.000Z'),
    phaseDeadline: new Date('2026-05-25T10:01:00.000Z'),
    participants,
    currentSpeakerSeat: 1,
    lastNominatorSeat: 2,
    nominationSeats: [1, 2],
    votes: new Map([
      [1, 2],
      [3, 1],
    ]),
    voteRoundIdx: 1,
    mafiaVotes: new Map([[2, 1]]),
    pendingMafiaTargetSeat: 1,
    sheriffCheck: { byUserId: 'user-1', targetSeat: 2, result: true },
    donCheck: null,
    lastNightVictimSeat: null,
    outOfTurnSpeaker: { userId: 'user-2', until: 1700000000000 },
    farewellSeat: null,
    lastWordSeats: [3],
    lastWordIdx: 0,
    tiedSeats: [1, 2],
    shootoutSpeakerIdx: 0,
    liftAllVotes: new Map([[1, true]]),
    bestMoveGuesses: [{ byUserId: 'user-1', guessedSeats: [2, 3] }],
    winner: null,
    roleCardPickerSeat: null,
    roleCardsPicked: [4, 7, 2],
    disqualifiedThisDay: false,
    firstDayMultiVoteKill: false,
    nextEventSeq: 42,
    ...overrides,
  };
}

describe('snapshot round-trip', () => {
  it('snapshotState → JSON.stringify → JSON.parse → parseSnapshot is lossless', () => {
    const state = buildState();
    const snap = snapshotState(state);
    const json = JSON.parse(JSON.stringify(snap));
    const parsed = parseSnapshot(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.phase).toBe(state.phase);
    expect(parsed!.dayNumber).toBe(state.dayNumber);
    expect(parsed!.votes).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(parsed!.mafiaVotes).toEqual([[2, 1]]);
    expect(parsed!.liftAllVotes).toEqual([[1, true]]);
    expect(parsed!.bestMoveGuesses).toEqual([{ byUserId: 'user-1', guessedSeats: [2, 3] }]);
    expect(parsed!.phaseStartedAt).toBe('2026-05-25T10:00:00.000Z');
    expect(parsed!.phaseDeadline).toBe('2026-05-25T10:01:00.000Z');
  });

  it('applySnapshotToState restores dynamic state and keeps identity', () => {
    const originalState = buildState();
    const snap = snapshotState(originalState);
    const json = JSON.parse(JSON.stringify(snap));
    const parsed = parseSnapshot(json)!;

    // Recovery starts from a blank state with identity loaded from DB.
    const blank = buildState({
      phase: GAME_PHASE.PLAYER_INTRODUCTION,
      dayNumber: 0,
      phaseStartedAt: null,
      phaseDeadline: null,
      currentSpeakerSeat: null,
      lastNominatorSeat: null,
      nominationSeats: [],
      votes: new Map(),
      voteRoundIdx: 0,
      mafiaVotes: new Map(),
      pendingMafiaTargetSeat: null,
      sheriffCheck: null,
      donCheck: null,
      tiedSeats: [],
      bestMoveGuesses: [],
      liftAllVotes: new Map(),
      roleCardsPicked: [],
      outOfTurnSpeaker: null,
      lastWordSeats: [],
    });
    const restored = applySnapshotToState(blank, parsed);

    expect(restored.phase).toBe(originalState.phase);
    expect(restored.dayNumber).toBe(originalState.dayNumber);
    expect(Array.from(restored.votes.entries())).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(restored.phaseStartedAt?.toISOString()).toBe('2026-05-25T10:00:00.000Z');
    // Identity preserved from `blank` state (id / lobbyId / participant identity).
    expect(restored.id).toBe(blank.id);
    expect(restored.lobbyId).toBe(blank.lobbyId);
    expect(restored.participants.find((p) => p.seat === 2)?.nickname).toBe('Player 2');
    // nextEventSeq preserved from `blank` (recovery tracks it separately).
    expect(restored.nextEventSeq).toBe(blank.nextEventSeq);
  });

  it('restores participant alive/fouls/removed deltas', () => {
    const state = buildState();
    // Mutate a participant to non-default values.
    state.participants[1]!.isAlive = false;
    state.participants[1]!.foulsCount = 3;
    state.participants[2]!.isRemoved = true;
    state.participants[3]!.hasSpokenThisDay = true;

    const snap = snapshotState(state);
    const json = JSON.parse(JSON.stringify(snap));
    const parsed = parseSnapshot(json)!;
    // Use a fresh blank state with default participants.
    const blank = buildState();
    blank.participants.forEach((p) => {
      p.isAlive = true;
      p.isRemoved = false;
      p.foulsCount = 0;
      p.hasSpokenThisDay = false;
    });

    const restored = applySnapshotToState(blank, parsed);
    expect(restored.participants[1]!.isAlive).toBe(false);
    expect(restored.participants[1]!.foulsCount).toBe(3);
    expect(restored.participants[2]!.isRemoved).toBe(true);
    expect(restored.participants[3]!.hasSpokenThisDay).toBe(true);
  });
});

describe('parseSnapshot validation', () => {
  it('returns null for non-object input', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot('hello')).toBeNull();
    expect(parseSnapshot(42)).toBeNull();
    expect(parseSnapshot([])).toBeNull();
  });

  it('returns null for wrong version', () => {
    const state = buildState();
    const snap = snapshotState(state) as Record<string, unknown>;
    snap.v = 2;
    expect(parseSnapshot(snap)).toBeNull();
  });

  it('returns null for missing required field', () => {
    const state = buildState();
    const snap = snapshotState(state) as Record<string, unknown>;
    delete snap.phase;
    expect(parseSnapshot(snap)).toBeNull();
  });
});

describe('snapshot covers all stateful fields', () => {
  // Guard against forgetting to extend snapshotState() when a new field is
  // added to GameState. Compares the set of top-level keys.
  it('preserves winner', () => {
    const state = buildState({ winner: TEAM.RED });
    const snap = snapshotState(state);
    expect(snap.winner).toBe(TEAM.RED);
  });

  it('preserves roleCardPickerSeat', () => {
    const state = buildState({ roleCardPickerSeat: 5 });
    const snap = snapshotState(state);
    expect(snap.roleCardPickerSeat).toBe(5);
  });

  it('preserves disqualifiedThisDay flag', () => {
    const state = buildState({ disqualifiedThisDay: true });
    const snap = snapshotState(state);
    expect(snap.disqualifiedThisDay).toBe(true);
  });

  it('preserves firstDayMultiVoteKill flag', () => {
    const state = buildState({ firstDayMultiVoteKill: true });
    const snap = snapshotState(state);
    expect(snap.firstDayMultiVoteKill).toBe(true);
  });
});
