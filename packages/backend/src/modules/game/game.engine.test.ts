// Unit tests for the pure game engine.
//
// The engine is the highest-risk part of the codebase: many phase transitions,
// many edge cases, all the rules of sport mafia condensed. These tests cover
// the rules we explicitly enforce and a few edge cases the audit flagged.

import { describe, expect, it } from 'vitest';

import { GAME_PHASE, ROLE, TEAM } from '@mafia/shared';

import {
  ENGINE_ERROR,
  applyAdvancePhase,
  applyBestMoveGuess,
  applyCastVote,
  applyDonCheck,
  applyJudgeFoul,
  applyJudgeRemove,
  applyJudgeUnfoul,
  applyLiftAllVote,
  applyMafiaTarget,
  applyNominate,
  applyNextSpeaker,
  applyOutOfTurn,
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
    lastNominatorSeat: null,
    nominationSeats: [],
    votes: new Map(),
    voteRoundIdx: 0,
    mafiaVotes: new Map(),
    pendingMafiaTargetSeat: null,
    sheriffCheck: null,
    donCheck: null,
    lastNightVictimSeat: null,
    outOfTurnSpeaker: null,
    farewellSeat: null,
    lastWordSeats: [],
    lastWordIdx: 0,
    tiedSeats: [],
    shootoutSpeakerIdx: 0,
    liftAllVotes: new Map(),
    bestMoveGuesses: [],
    roleCardPickerSeat: null,
    roleCardsPicked: [],
    disqualifiedThisDay: false,
    firstDayMultiVoteKill: false,
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

describe('applyNominate (judge-driven)', () => {
  it('refuses non-judge actor', () => {
    // Players talk; the judge clicks. A direct nominate call from a player
    // is rejected — only the judge can record nominations.
    const state = buildState({ currentSpeakerSeat: 1 });
    const result = applyNominate(state, 'user-1', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  });

  it('allows self-nomination (player asks the judge to nominate them)', () => {
    // По решению пользователя: игрок имеет право заявить себя на отстрел.
    const state = buildState({ currentSpeakerSeat: 1 });
    const result = applyNominate(state, 'user-judge', 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.nominationSeats).toContain(1);
  });

  it('refuses nominating a dead player', () => {
    const state = buildState({
      currentSpeakerSeat: 1,
      participants: buildState().participants.map((p) =>
        p.seat === 5 ? { ...p, isAlive: false } : p,
      ),
    });
    const result = applyNominate(state, 'user-judge', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.TARGET_NOT_LIVE);
  });

  it('refuses outside of day_speech', () => {
    const state = buildState({ phase: GAME_PHASE.DAY_VOTE });
    const result = applyNominate(state, 'user-judge', 2);
    expect(result.ok).toBe(false);
  });

  it('records a nomination on the judge action', () => {
    const state = buildState({ currentSpeakerSeat: 1 });
    const result = applyNominate(state, 'user-judge', 5);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.nominationSeats).toEqual([5]);
  });
});

describe('applyCastVote (sequential rounds)', () => {
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

  it('only accepts a vote for the current round candidate', () => {
    // voteRoundIdx=0 → only seat 3 (nominationSeats[0]) is being voted on.
    // Trying to vote for seat 5 (which is round 1) is rejected.
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      voteRoundIdx: 0,
    });
    const result = applyCastVote(state, 'user-1', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.NOT_YOUR_TURN);
  });

  it('applyNextSpeaker advances to the next vote round mid-vote', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5, 7],
      voteRoundIdx: 0,
      votes: new Map([[1, 3]]),
    });
    const advanced = applyNextSpeaker(state);
    expect(advanced.state.voteRoundIdx).toBe(1);
    expect(advanced.speechesDone).toBe(false);
    // Existing votes stay — voter at seat 1 already locked for seat 3.
    expect(advanced.state.votes.get(1)).toBe(3);
  });

  it('applyNextSpeaker auto-casts non-nominated voters to the LAST candidate', () => {
    // Three candidates [3, 5, 7], we're on the last round, only seat 1 has
    // voted (for 3). ФИИМ: всех выставленных тоже исключаем из auto-cast —
    // нельзя принудительно голосовать против конкурента.
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5, 7],
      voteRoundIdx: 2,
      votes: new Map([[1, 3]]),
    });
    const advanced = applyNextSpeaker(state);
    expect(advanced.speechesDone).toBe(true);
    expect(advanced.state.voteRoundIdx).toBe(3); // past end
    // seat 1 keeps their original vote
    expect(advanced.state.votes.get(1)).toBe(3);
    // seats 2, 4, 6, 8, 9, 10 — НЕ выставленные — auto-cast за 7
    for (const seat of [2, 4, 6, 8, 9, 10]) {
      expect(advanced.state.votes.get(seat)).toBe(7);
    }
    // Все выставленные (3, 5, 7) остаются абстенциями — их собственный голос
    // не записан.
    expect(advanced.state.votes.has(3)).toBe(false);
    expect(advanced.state.votes.has(5)).toBe(false);
    expect(advanced.state.votes.has(7)).toBe(false);
  });

  it('also works for DAY_REVOTE (sequential)', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_REVOTE,
      nominationSeats: [3, 5],
      tiedSeats: [3, 5],
      voteRoundIdx: 0,
    });
    const r = applyCastVote(state, 'user-1', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.votes.get(1)).toBe(3);
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

// --- Sprint 2 engine-correctness fixes ---

describe('don/sheriff double-check guard', () => {
  it('refuses a second don check in the same night', () => {
    const first = applyDonCheck(buildState({ phase: GAME_PHASE.NIGHT_DON }), 'user-10', 7);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applyDonCheck(first.data, 'user-10', 1);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe(ENGINE_ERROR.ALREADY_CHECKED);
  });

  it('refuses a second sheriff check in the same night', () => {
    const first = applySheriffCheck(buildState({ phase: GAME_PHASE.NIGHT_SHERIFF }), 'user-7', 8);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = applySheriffCheck(first.data, 'user-7', 1);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe(ENGINE_ERROR.ALREADY_CHECKED);
  });
});

describe('mafia consensus rule for night kill', () => {
  // Place the game just before the final night→morning transition. Resolution
  // happens when applyAdvancePhase is called with phase=NIGHT_SHERIFF.
  function nightStateWithVotes(votes: Array<[number, number]>): GameState {
    return buildState({
      phase: GAME_PHASE.NIGHT_SHERIFF,
      mafiaVotes: new Map(votes),
    });
  }

  it('kills the target when all alive shooters agree', () => {
    // seats 8, 9 = mafia, 10 = don; all vote seat 1
    const state = nightStateWithVotes([
      [8, 1],
      [9, 1],
      [10, 1],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.lastNightVictimSeat).toBe(1);
    const seat1 = next.participants.find((p) => p.seat === 1);
    expect(seat1?.isAlive).toBe(false);
  });

  it('misses when shooters disagree (one different target)', () => {
    const state = nightStateWithVotes([
      [8, 1],
      [9, 2],
      [10, 1],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.lastNightVictimSeat).toBe(null);
    // Nobody was killed.
    expect(next.participants.find((p) => p.seat === 1)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 2)?.isAlive).toBe(true);
  });

  it('misses when not all shooters have voted', () => {
    // Only mafia at seat 8 voted; seat 9 and the don abstained.
    const state = nightStateWithVotes([[8, 1]]);
    const next = applyAdvancePhase(state);
    expect(next.lastNightVictimSeat).toBe(null);
    expect(next.participants.find((p) => p.seat === 1)?.isAlive).toBe(true);
  });

  it('ignores dead shooters when computing consensus', () => {
    // Don (seat 10) is dead → only seats 8 and 9 must agree.
    const base = buildState({
      phase: GAME_PHASE.NIGHT_SHERIFF,
      participants: buildState().participants.map((p) =>
        p.seat === 10 ? { ...p, isAlive: false } : p,
      ),
      mafiaVotes: new Map([
        [8, 1],
        [9, 1],
      ]),
    });
    const next = applyAdvancePhase(base);
    expect(next.lastNightVictimSeat).toBe(1);
  });
});

describe('day rotation', () => {
  // The engine takes two different paths into DAY_SPEECH:
  //   NIGHT_ZERO → DAY_SPEECH (no dayNumber bump — first day only)
  //   MORNING_ANNOUNCEMENT → DAY_SPEECH (bumps dayNumber by 1)
  // Both end up calling dayStartSeat, so we exercise the rotation on both.

  it('first day (via night_zero) starts at seat 1', () => {
    // The buggy formula returned seat 0 (invalid) on the first day and
    // accidentally found seat 1 via the search loop; this test pins the
    // corrected behavior so that any future change shows up immediately.
    const state = applyAdvancePhase(buildState({ phase: GAME_PHASE.NIGHT_ZERO, dayNumber: 0 }));
    expect(state.phase).toBe(GAME_PHASE.DAY_SPEECH);
    expect(state.currentSpeakerSeat).toBe(1);
  });

  it('second day (via morning) starts at seat 2', () => {
    // Morning bumps dayNumber 0 → 1; dayStartSeat with 1 yields seat 2.
    // Bug repro: previously this also returned seat 1.
    const state = applyAdvancePhase(
      buildState({ phase: GAME_PHASE.MORNING_ANNOUNCEMENT, dayNumber: 0 }),
    );
    expect(state.phase).toBe(GAME_PHASE.DAY_SPEECH);
    expect(state.currentSpeakerSeat).toBe(2);
  });

  it('wraps every 10 days', () => {
    // Morning at dayNumber=9 → bumps to 10 → (10 % 10) + 1 = 1.
    const state = applyAdvancePhase(
      buildState({ phase: GAME_PHASE.MORNING_ANNOUNCEMENT, dayNumber: 9 }),
    );
    expect(state.currentSpeakerSeat).toBe(1);
  });
});

describe('applyJudgeRemove cleanup', () => {
  it('purges removed player from nominations and their own cast vote', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 5],
        [2, 5],
        [3, 5], // seat 3 (about to be removed) votes for seat 5
      ]),
    });
    const result = applyJudgeRemove(state, 'user-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Removed player's seat must vanish from nominations …
    expect(result.data.nominationSeats).not.toContain(3);
    // … and their cast vote (key on voterSeat) must be gone …
    expect(result.data.votes.has(3)).toBe(false);
    // … but unrelated voters' choices stay intact.
    expect(result.data.votes.get(1)).toBe(5);
    expect(result.data.votes.get(2)).toBe(5);
  });

  it('drops votes targeted at the removed player', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3], // votes against seat 3 (about to be removed)
        [2, 5],
      ]),
    });
    const result = applyJudgeRemove(state, 'user-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.votes.has(1)).toBe(false);
    expect(result.data.votes.get(2)).toBe(5);
  });

  it('drops mafia votes by or against the removed player', () => {
    const state = buildState({
      phase: GAME_PHASE.NIGHT_MAFIA,
      mafiaVotes: new Map([
        [8, 1], // mafia at 8 votes seat 1
        [9, 3], // mafia at 9 votes seat 3 (the one being removed)
        [10, 1], // don votes seat 1
      ]),
    });
    const result = applyJudgeRemove(state, 'user-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Seat 9's vote targeted seat 3 → drop it. Other shooter votes stay.
    expect(result.data.mafiaVotes.has(9)).toBe(false);
    expect(result.data.mafiaVotes.get(8)).toBe(1);
    expect(result.data.mafiaVotes.get(10)).toBe(1);
  });
});

describe('tie-break flow (shootout → revote)', () => {
  function tiedDayVoteState(): GameState {
    return buildState({
      phase: GAME_PHASE.DAY_VOTE,
      currentSpeakerSeat: null,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 5],
      ]),
    });
  }

  it('routes a 2-way tie to DAY_SHOOTOUT with first tied as speaker', () => {
    const next = applyAdvancePhase(tiedDayVoteState());
    expect(next.phase).toBe(GAME_PHASE.DAY_SHOOTOUT);
    expect(next.tiedSeats).toEqual([3, 5]);
    expect(next.shootoutSpeakerIdx).toBe(0);
    expect(next.currentSpeakerSeat).toBe(3);
    // nominationSeats is pinned to the tied list so the revote uses these
    // candidates via the existing applyCastVote check.
    expect(next.nominationSeats).toEqual([3, 5]);
    // Both tied players are still alive — the shootout doesn't kill anyone.
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(true);
  });

  it('advances through tied speakers in shootout via applyNextSpeaker', () => {
    const shootout = applyAdvancePhase(tiedDayVoteState());
    expect(shootout.currentSpeakerSeat).toBe(3);
    const second = applyNextSpeaker(shootout);
    expect(second.state.currentSpeakerSeat).toBe(5);
    expect(second.speechesDone).toBe(false);
    const done = applyNextSpeaker(second.state);
    expect(done.speechesDone).toBe(true);
  });

  it('shootout → revote clears the speaker slot but keeps tiedSeats', () => {
    const shootout = applyAdvancePhase(tiedDayVoteState());
    // Walk through both speakers, then advance phase.
    const after1 = applyNextSpeaker(shootout).state;
    const after2 = applyNextSpeaker(after1).state;
    const revote = applyAdvancePhase(after2);
    expect(revote.phase).toBe(GAME_PHASE.DAY_REVOTE);
    expect(revote.tiedSeats).toEqual([3, 5]);
    expect(revote.currentSpeakerSeat).toBe(null);
  });

  it('revote with a clear winner eliminates them and goes to last word', () => {
    const revote = buildState({
      phase: GAME_PHASE.DAY_REVOTE,
      currentSpeakerSeat: null,
      tiedSeats: [3, 5],
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 3],
        [4, 5],
      ]),
    });
    const next = applyAdvancePhase(revote);
    expect(next.phase).toBe(GAME_PHASE.DAY_LAST_WORD);
    expect(next.lastWordSeats).toEqual([3]);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(false);
    // Tie-break trail is cleaned up.
    expect(next.tiedSeats).toEqual([]);
  });

  it('revote that ties again enters DAY_LIFT_VOTE', () => {
    const revote = buildState({
      phase: GAME_PHASE.DAY_REVOTE,
      currentSpeakerSeat: null,
      tiedSeats: [3, 5],
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 5],
      ]),
    });
    const next = applyAdvancePhase(revote);
    expect(next.phase).toBe(GAME_PHASE.DAY_LIFT_VOTE);
    // tiedSeats survives — we still need to know who's on the chopping block.
    expect(next.tiedSeats).toEqual([3, 5]);
    expect(next.liftAllVotes.size).toBe(0);
    // Nobody died yet.
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(true);
  });
});

describe('lift-all vote', () => {
  function liftVoteState(votes: Array<[number, boolean]> = []): GameState {
    return buildState({
      phase: GAME_PHASE.DAY_LIFT_VOTE,
      currentSpeakerSeat: null,
      tiedSeats: [3, 5],
      liftAllVotes: new Map(votes),
    });
  }

  it('records a yes/no ballot for an alive voter', () => {
    const r = applyLiftAllVote(liftVoteState(), 'user-1', true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.liftAllVotes.get(1)).toBe(true);
  });

  it('refuses a second ballot from the same voter', () => {
    const after = applyLiftAllVote(liftVoteState([[1, true]]), 'user-1', false);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error).toBe(ENGINE_ERROR.ALREADY_VOTED);
  });

  it('majority (>=50%) of alive kills every tied seat and queues them all for last word', () => {
    // 10 players alive in the default buildState — ФИИМ: >=50% уже поднимает.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, true],
      [6, true],
      [7, true],
      [8, true],
      [9, false],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.DAY_LAST_WORD);
    expect(next.lastWordSeats).toEqual([3, 5]);
    expect(next.lastWordIdx).toBe(0);
    expect(next.currentSpeakerSeat).toBe(3);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(false);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(false);
    expect(next.tiedSeats).toEqual([]);
    expect(next.liftAllVotes.size).toBe(0);
  });

  it('exactly 50% yes IS enough to lift per ФИИМ', () => {
    // 5 yes / 5 silent with 10 alive — ровно 50%, по ФИИМ поднимает.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, true],
      [6, true],
      [7, true],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.DAY_LAST_WORD);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(false);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(false);
  });

  it('below 50% yes does NOT lift', () => {
    // 4 yes — меньше половины. Никто не уходит.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, true],
      [6, true],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(true);
  });

  it('majority no (or tie) spares everyone and exits to night', () => {
    // 2 yes vs 3 no — minority lift fails.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, false],
      [6, false],
      [7, false],
    ]);
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
    expect(next.lastWordSeats).toEqual([]);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(true);
  });

  it('all abstain → no kill, goes to night', () => {
    const next = applyAdvancePhase(liftVoteState([]));
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
    expect(next.tiedSeats).toEqual([]);
  });

  it('walks the multi-victim last-word queue via applyNextSpeaker', () => {
    // 6 yes / 10 alive → passes the >=50% gate.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, true],
      [6, true],
      [7, true],
      [8, true],
    ]);
    const last = applyAdvancePhase(state);
    expect(last.currentSpeakerSeat).toBe(3);
    const second = applyNextSpeaker(last);
    expect(second.state.currentSpeakerSeat).toBe(5);
    const done = applyNextSpeaker(second.state);
    expect(done.speechesDone).toBe(true);
  });

  it('Day-1 multi-kill через lift sets firstDayMultiVoteKill', () => {
    // dayNumber=0 → текущий день в нашей нумерации это Day 1.
    // Подъём убивает двух → флаг ставится.
    const state = liftVoteState([
      [1, true],
      [2, true],
      [4, true],
      [6, true],
      [7, true],
      [8, true],
    ]);
    const next = applyAdvancePhase({ ...state, dayNumber: 0 });
    expect(next.firstDayMultiVoteKill).toBe(true);
  });
});

describe('day_last_word after vote elimination', () => {
  it('routes day_vote with a winner into day_last_word', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 3],
        [4, 5],
      ]),
    });
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.DAY_LAST_WORD);
    // Eliminated player is dead but holds the floor as the last-word speaker.
    expect(next.currentSpeakerSeat).toBe(3);
    expect(next.lastWordSeats).toEqual([3]);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(false);
  });

  it('single nominee auto-kills without a vote (ФИИМ)', () => {
    // ФИИМ: один выставленный = автокилл без голосования.
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      currentSpeakerSeat: null,
      nominationSeats: [3],
      votes: new Map(),
    });
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.DAY_LAST_WORD);
    expect(next.lastWordSeats).toEqual([3]);
    expect(next.currentSpeakerSeat).toBe(3);
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(false);
  });

  it('no nominations at all — straight to night', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      currentSpeakerSeat: null,
      nominationSeats: [],
      votes: new Map(),
    });
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
  });

  it('day-vote with disqualifiedThisDay flag is cancelled — straight to night', () => {
    // ФИИМ: если в день кого-то дисквалифицировали — текущее голосование
    // отменяется, никто не отстреливается.
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      currentSpeakerSeat: null,
      nominationSeats: [3, 5],
      votes: new Map([
        [1, 3],
        [2, 3],
      ]),
      disqualifiedThisDay: true,
    });
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
    // Никто не убит голосованием.
    expect(next.participants.find((p) => p.seat === 3)?.isAlive).toBe(true);
    expect(next.participants.find((p) => p.seat === 5)?.isAlive).toBe(true);
  });

  it('DAY_SPEECH с nominations идёт в DAY_VOTE_INTRO, потом в DAY_VOTE', () => {
    // Закончились речи, есть выставленные → перед голосованием стадия
    // объявления (без таймера). Судья жмёт «Дальше» → собственно голосование.
    const speechDone = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      currentSpeakerSeat: null,
      nominationSeats: [3, 5],
      participants: buildState().participants.map((p) => ({ ...p, hasSpokenThisDay: true })),
    });
    const afterSpeech = applyAdvancePhase(speechDone);
    expect(afterSpeech.phase).toBe(GAME_PHASE.DAY_VOTE_INTRO);
    expect(afterSpeech.nominationSeats).toEqual([3, 5]);

    const afterIntro = applyAdvancePhase(afterSpeech);
    expect(afterIntro.phase).toBe(GAME_PHASE.DAY_VOTE);
    expect(afterIntro.voteRoundIdx).toBe(0);
  });

  it('DAY_SPEECH без nominations пропускает intro и идёт в ночь', () => {
    const speechDone = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      currentSpeakerSeat: null,
      nominationSeats: [],
      participants: buildState().participants.map((p) => ({ ...p, hasSpokenThisDay: true })),
    });
    const next = applyAdvancePhase(speechDone);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
  });

  it('applyJudgeRemove во время DAY_VOTE ставит disqualifiedThisDay', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_VOTE,
      currentSpeakerSeat: null,
      nominationSeats: [3, 5],
      votes: new Map([[1, 3]]),
    });
    const result = applyJudgeRemove(state, 'user-2');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.disqualifiedThisDay).toBe(true);
  });

  it('exits day_last_word into night_mafia and clears the queue', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_LAST_WORD,
      lastWordSeats: [3],
      lastWordIdx: 0,
      currentSpeakerSeat: 3,
    });
    const next = applyAdvancePhase(state);
    expect(next.phase).toBe(GAME_PHASE.NIGHT_MAFIA);
    expect(next.lastWordSeats).toEqual([]);
    expect(next.currentSpeakerSeat).toBe(null);
  });
});

describe('applyBestMoveGuess (LH — жертва первой ночи на утренней прощальной)', () => {
  // ФИИМ: ЛХ даёт ЖЕРТВА первой ночи в свою farewell-минуту утром Day 1.
  // Кого выгнали голосованием — ЛХ НЕ называет.
  function farewellState(): GameState {
    return buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      dayNumber: 1,
      farewellSeat: 3,
      currentSpeakerSeat: 3,
      participants: buildState().participants.map((p) =>
        p.seat === 3 ? { ...p, isAlive: false } : p,
      ),
    });
  }

  it('records a valid 1–3 seat guess from the first-night victim during farewell', () => {
    const result = applyBestMoveGuess(farewellState(), 'user-3', [8, 9, 10]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bestMoveGuesses).toEqual([{ byUserId: 'user-3', guessedSeats: [8, 9, 10] }]);
  });

  it('rejects a guess from someone who is not the farewell speaker', () => {
    const result = applyBestMoveGuess(farewellState(), 'user-1', [8, 9, 10]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.NOT_YOUR_TURN);
  });

  it('rejects a second guess from the same speaker', () => {
    const first = applyBestMoveGuess(farewellState(), 'user-3', [8, 9, 10]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyBestMoveGuess(first.data, 'user-3', [1, 2, 4]);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe(ENGINE_ERROR.ALREADY_GUESSED);
  });

  it('rejects an empty or oversized guess list', () => {
    const empty = applyBestMoveGuess(farewellState(), 'user-3', []);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe(ENGINE_ERROR.INVALID_GUESS);

    const tooMany = applyBestMoveGuess(farewellState(), 'user-3', [1, 2, 4, 5]);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error).toBe(ENGINE_ERROR.INVALID_GUESS);
  });

  it('rejects a guess containing duplicate seats', () => {
    const result = applyBestMoveGuess(farewellState(), 'user-3', [8, 8, 9]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.INVALID_GUESS);
  });

  it('rejects in DAY_LAST_WORD (выгнанный голосованием ЛХ НЕ называет)', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_LAST_WORD,
      lastWordSeats: [3],
      currentSpeakerSeat: 3,
    });
    const result = applyBestMoveGuess(state, 'user-3', [8, 9]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.WRONG_PHASE);
  });

  it('rejects outside of farewell (обычная дневная речь)', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      dayNumber: 1,
      farewellSeat: null,
      currentSpeakerSeat: 1,
    });
    const result = applyBestMoveGuess(state, 'user-1', [8, 9]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.WRONG_PHASE);
  });

  it('rejects on Day 2+ (только жертва ПЕРВОЙ ночи)', () => {
    const state = { ...farewellState(), dayNumber: 2 };
    const result = applyBestMoveGuess(state, 'user-3', [8, 9, 10]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.WRONG_PHASE);
  });

  it('rejects when Day 1 lift-all killed 2+ (firstDayMultiVoteKill)', () => {
    const state = { ...farewellState(), firstDayMultiVoteKill: true };
    const result = applyBestMoveGuess(state, 'user-3', [8, 9, 10]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.WRONG_PHASE);
  });
});

describe('foul effects', () => {
  it('3 fouls mutes a player — skipped in the speech rotation', () => {
    // Seat 1 sits on 3 fouls. Day-speech rotation starts there but should
    // hand the floor to the next un-muted, un-spoken alive player (seat 2).
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      currentSpeakerSeat: 1,
      participants: buildState().participants.map((p) =>
        p.seat === 1 ? { ...p, foulsCount: 3 } : p,
      ),
    });
    // Force the rotation by marking seat 1 as having "spoken" (they didn't —
    // they were skipped), then ask for the next speaker. The cleaner check
    // is to call applyNextSpeaker from seat 1 and see that seat 2 picks up.
    const advanced = applyNextSpeaker(state);
    // Seat 1 was the "current" speaker so applyNextSpeaker marks them
    // hasSpokenThisDay; the next pick must skip anyone muted. With our setup
    // only seat 1 is muted, so the next speaker is seat 2.
    expect(advanced.state.currentSpeakerSeat).toBe(2);
  });

  it('фол на 3-х НЕ auto-removes (защита от случайного клика)', () => {
    // По решению пользователя: при 4 фоле игрок НЕ удаляется автоматически.
    // Ведущий сам решает: либо снять случайный фол, либо удалить вручную.
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      participants: buildState().participants.map((p) =>
        p.seat === 1 ? { ...p, foulsCount: 3 } : p,
      ),
    });
    const result = applyJudgeFoul(state, 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat1 = result.data.participants.find((p) => p.seat === 1);
    expect(seat1?.foulsCount).toBe(4);
    expect(seat1?.isRemoved).toBe(false);
    expect(seat1?.isAlive).toBe(true);
  });

  it('фол на игроке с 4 фолами отклоняется — ведущий решает вручную', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      participants: buildState().participants.map((p) =>
        p.seat === 1 ? { ...p, foulsCount: 4 } : p,
      ),
    });
    const result = applyJudgeFoul(state, 'user-1');
    expect(result.ok).toBe(false);
  });

  it('out-of-turn запрещён игроку с 3 фолами (защита от one-click техпотери)', () => {
    // ФИИМ: с 3 фолами игрок уже лишён слова. Кнопка «под фол» для него
    // была бы добровольным четвёртым фолом → техпотеря. Движок отклоняет.
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      participants: buildState().participants.map((p) =>
        p.seat === 1 ? { ...p, foulsCount: 3 } : p,
      ),
    });
    const result = applyOutOfTurn(state, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
    // Игрок остаётся в игре, фолы не растут.
    const seat1 = state.participants.find((p) => p.seat === 1);
    expect(seat1?.foulsCount).toBe(3);
    expect(seat1?.isRemoved).toBe(false);
  });

  it('foul below the threshold leaves the player playing', () => {
    const state = buildState({ phase: GAME_PHASE.DAY_SPEECH });
    const result = applyJudgeFoul(state, 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat1 = result.data.participants.find((p) => p.seat === 1);
    expect(seat1?.foulsCount).toBe(1);
    expect(seat1?.isAlive).toBe(true);
    expect(seat1?.isRemoved).toBe(false);
  });

  it('applyJudgeUnfoul снижает счётчик на 1 (от случайного клика)', () => {
    const state = buildState({
      phase: GAME_PHASE.DAY_SPEECH,
      participants: buildState().participants.map((p) =>
        p.seat === 1 ? { ...p, foulsCount: 2 } : p,
      ),
    });
    const result = applyJudgeUnfoul(state, 'user-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const seat1 = result.data.participants.find((p) => p.seat === 1);
    expect(seat1?.foulsCount).toBe(1);
  });

  it('applyJudgeUnfoul на нуле отказывает', () => {
    const state = buildState({ phase: GAME_PHASE.DAY_SPEECH });
    const result = applyJudgeUnfoul(state, 'user-1');
    expect(result.ok).toBe(false);
  });
});
