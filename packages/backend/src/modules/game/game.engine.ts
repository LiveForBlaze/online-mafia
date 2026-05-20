// Pure functions that drive game state forward.
//
// All functions here are intentionally side-effect-free — they take a state and inputs,
// return a new state (or an error). Persistence and broadcasting live in game.service.ts;
// keeping the engine pure makes it trivially testable and avoids accidental ordering bugs.

import {
  DEFAULT_PHASE_DURATION_SEC,
  GAME_PHASE,
  ROLE,
  ROLE_COUNTS,
  ROLE_TO_TEAM,
  TEAM,
  type GamePhase,
  type GameStateProjected,
  type Role,
  type Team,
} from '@mafia/shared';

import {
  alivePlayers,
  findBySeat,
  findByUserId,
  type GameParticipant,
  type GameState,
} from './game.state.js';

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
  GAME_OVER: 'game_over',
  CANNOT_TARGET_SELF: 'cannot_target_self',
  NO_NOMINATIONS_TO_VOTE: 'no_nominations_to_vote',
} as const;
export type EngineErrorCode = (typeof ENGINE_ERROR)[keyof typeof ENGINE_ERROR];

const ok = <T>(data: T): EngineResult<T> => ({ ok: true, data });
const fail = (error: EngineErrorCode): EngineResult<never> => ({ ok: false, error });

// ---- Role distribution ----

/**
 * Shuffle the seated players' roles in place. Uses Fisher-Yates with crypto-grade randomness
 * so two parallel games cannot ever produce the same role order from a known seed.
 */
export function assignRoles(participants: GameParticipant[]): GameParticipant[] {
  const players = participants.filter((p) => !p.isJudge);
  const indices = players.map((_, idx) => idx);

  // Fisher–Yates shuffle with crypto.getRandomValues.
  const buffer = new Uint32Array(indices.length);
  crypto.getRandomValues(buffer);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = buffer[i]! % (i + 1);
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }

  const roleQueue: Role[] = [
    ...Array(ROLE_COUNTS.MAFIA).fill(ROLE.MAFIA),
    ...Array(ROLE_COUNTS.DON).fill(ROLE.DON),
    ...Array(ROLE_COUNTS.SHERIFF).fill(ROLE.SHERIFF),
    ...Array(ROLE_COUNTS.CIVILIAN).fill(ROLE.CIVILIAN),
  ];

  const withRoles = participants.map((p) => ({ ...p }));
  indices.forEach((shuffledIdx, originalIdx) => {
    const target = players[shuffledIdx]!;
    const updatedIdx = withRoles.findIndex((p) => p.userId === target.userId);
    withRoles[updatedIdx] = { ...withRoles[updatedIdx]!, role: roleQueue[originalIdx]! };
  });

  return withRoles;
}

// ---- Win condition ----

export function checkWinner(state: GameState): Team | null {
  const alive = alivePlayers(state);
  const aliveBlack = alive.filter((p) => p.role && ROLE_TO_TEAM[p.role] === TEAM.BLACK).length;
  const aliveRed = alive.filter((p) => p.role && ROLE_TO_TEAM[p.role] === TEAM.RED).length;

  if (aliveBlack === 0) return TEAM.RED;
  if (aliveBlack >= aliveRed) return TEAM.BLACK;
  return null;
}

// ---- Speech phase helpers ----

/**
 * Returns the seat of the next player who has not yet spoken today, going clockwise
 * from the given start seat. Returns null if everybody has spoken.
 */
export function nextSpeakerSeat(state: GameState, startSeat: number): number | null {
  const alive = alivePlayers(state).filter((p) => !p.hasSpokenThisDay);
  if (alive.length === 0) return null;
  // Sort by seat starting at startSeat, wrapping around.
  const sorted = [...alive].sort((a, b) => {
    const ax = (a.seat! - startSeat + 10) % 10;
    const bx = (b.seat! - startSeat + 10) % 10;
    return ax - bx;
  });
  return sorted[0]?.seat ?? null;
}

// ---- Vote resolution ----

/**
 * Tally the vote map and return either the winning seat (single most-voted candidate)
 * or null in case of a tie / empty vote.
 */
export function resolveVote(state: GameState): number | null {
  const tally = new Map<number, number>();
  for (const [, candidateSeat] of state.votes) {
    tally.set(candidateSeat, (tally.get(candidateSeat) ?? 0) + 1);
  }
  if (tally.size === 0) return null;

  let topSeat: number | null = null;
  let topCount = -1;
  let isTie = false;
  for (const [seat, count] of tally) {
    if (count > topCount) {
      topSeat = seat;
      topCount = count;
      isTie = false;
    } else if (count === topCount) {
      isTie = true;
    }
  }
  return isTie ? null : topSeat;
}

// ---- Phase transitions ----

/**
 * Compute the next phase given the current one and the current state.
 * This function is the single source of truth for the FSM order.
 */
export function nextPhase(state: GameState): GamePhase {
  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return GAME_PHASE.NIGHT_ZERO;
    case GAME_PHASE.NIGHT_ZERO:
      return GAME_PHASE.DAY_SPEECH;
    case GAME_PHASE.DAY_SPEECH:
      // Speeches end → vote if there are nominations, else go to night.
      return state.nominationSeats.length > 0 ? GAME_PHASE.DAY_VOTE : GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_VOTE:
      // After vote resolution we always proceed to night.
      return GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.NIGHT_MAFIA:
      return GAME_PHASE.NIGHT_DON;
    case GAME_PHASE.NIGHT_DON:
      return GAME_PHASE.NIGHT_SHERIFF;
    case GAME_PHASE.NIGHT_SHERIFF:
      return GAME_PHASE.MORNING_ANNOUNCEMENT;
    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return GAME_PHASE.DAY_SPEECH;
    case GAME_PHASE.GAME_OVER:
      return GAME_PHASE.GAME_OVER;
    default:
      return state.phase;
  }
}

// ---- Action handlers (pure) ----

export function applyNominate(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_SPEECH) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
  if (actor.seat !== state.currentSpeakerSeat) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
  if (state.nominationSeats.includes(targetSeat)) return fail(ENGINE_ERROR.ALREADY_NOMINATED);
  // A player cannot nominate themselves — would lead to a pathological state where
  // they're the only candidate and can't vote for themselves either.
  if (target.userId === actorUserId) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);

  return ok({ ...state, nominationSeats: [...state.nominationSeats, targetSeat] });
}

export function applyCastVote(
  state: GameState,
  actorUserId: string,
  candidateSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_VOTE) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
  if (!state.nominationSeats.includes(candidateSeat)) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (actor.seat === candidateSeat) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);
  if (state.votes.has(actor.seat!)) return fail(ENGINE_ERROR.ALREADY_VOTED);

  const newVotes = new Map(state.votes);
  newVotes.set(actor.seat!, candidateSeat);
  return ok({ ...state, votes: newVotes });
}

export function applyMafiaTarget(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.NIGHT_MAFIA) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
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

  return ok({ ...state, pendingMafiaTargetSeat: targetSeat });
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

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
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

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
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

// ---- Judge-driven transitions ----

export function applyAdvancePhase(state: GameState): GameState {
  // Resolve side-effects of the *current* phase before transitioning.
  let next: GameState = { ...state };

  if (state.phase === GAME_PHASE.DAY_VOTE) {
    const eliminatedSeat = resolveVote(state);
    if (eliminatedSeat !== null) {
      next = killSeat(next, eliminatedSeat);
    }
    next = { ...next, votes: new Map(), nominationSeats: [] };
  }

  if (state.phase === GAME_PHASE.DAY_SPEECH) {
    // Speeches done: clear per-day flags before either voting or skipping to night.
    next = {
      ...next,
      participants: next.participants.map((p) => ({ ...p, hasSpokenThisDay: false })),
      currentSpeakerSeat: null,
    };
  }

  if (state.phase === GAME_PHASE.NIGHT_SHERIFF) {
    // Tomorrow's morning: apply the mafia kill (if any) and bump the day counter.
    if (next.pendingMafiaTargetSeat !== null) {
      const victimSeat = next.pendingMafiaTargetSeat;
      next = killSeat(next, victimSeat);
      next = { ...next, lastNightVictimSeat: victimSeat };
    } else {
      next = { ...next, lastNightVictimSeat: null };
    }
  }

  if (state.phase === GAME_PHASE.MORNING_ANNOUNCEMENT) {
    // New day starts. Reset transient state and pick the first speaker.
    next = {
      ...next,
      dayNumber: next.dayNumber + 1,
      pendingMafiaTargetSeat: null,
      lastNightVictimSeat: null,
      sheriffCheck: null,
      donCheck: null,
      nominationSeats: [],
      votes: new Map(),
      participants: next.participants.map((p) => ({ ...p, hasSpokenThisDay: false })),
    };
  }

  // Now determine the next phase.
  let phase = nextPhase(next);

  // Check end-of-game conditions after any kill (vote or night).
  const winner = checkWinner(next);
  if (winner !== null) {
    return { ...next, phase: GAME_PHASE.GAME_OVER, status: 'finished', winner };
  }

  // Entering day_speech: pick the first speaker (lowest-seat living player).
  if (phase === GAME_PHASE.DAY_SPEECH) {
    const startSeat = firstAliveSeatAfterMorning(next);
    next = {
      ...next,
      currentSpeakerSeat: startSeat,
    };
  }

  return withFreshDeadline({ ...next, phase }, phase);
}

function firstAliveSeatAfterMorning(state: GameState): number | null {
  const alive = alivePlayers(state).sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  return alive[0]?.seat ?? null;
}

/**
 * Advance the day_speech phase to the next living non-spoken player.
 * Returns the updated state and whether the round of speeches is now complete.
 */
export function applyNextSpeaker(state: GameState): {
  state: GameState;
  speechesDone: boolean;
} {
  if (state.phase !== GAME_PHASE.DAY_SPEECH || state.currentSpeakerSeat === null) {
    return { state, speechesDone: false };
  }

  // Mark the current speaker as having spoken.
  const current = findBySeat(state, state.currentSpeakerSeat);
  if (!current) return { state, speechesDone: false };

  const updated: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === current.userId ? { ...p, hasSpokenThisDay: true } : p,
    ),
  };

  const next = nextSpeakerSeat(updated, state.currentSpeakerSeat + 1);
  if (next === null) {
    return { state: { ...updated, currentSpeakerSeat: null }, speechesDone: true };
  }
  // New speaker → fresh 60-second timer.
  return {
    state: withFreshDeadline({ ...updated, currentSpeakerSeat: next }, GAME_PHASE.DAY_SPEECH),
    speechesDone: false,
  };
}

export function applyJudgeFoul(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  return ok({
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, foulsCount: p.foulsCount + 1 } : p,
    ),
  });
}

export function applyJudgeRemove(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  const next: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, isRemoved: true, isAlive: false } : p,
    ),
  };
  const winner = checkWinner(next);
  if (winner !== null) {
    return ok({ ...next, phase: GAME_PHASE.GAME_OVER, status: 'finished', winner });
  }
  return ok(next);
}

function killSeat(state: GameState, seat: number): GameState {
  return {
    ...state,
    participants: state.participants.map((p) => (p.seat === seat ? { ...p, isAlive: false } : p)),
  };
}

// ---- Projection ----

/**
 * Build the state to send to a specific viewer. The viewer sees:
 *   - everyone's role only if the game is over or the viewer is the judge
 *   - their own role always
 *   - other mafia/don roles if the viewer is mafia or don
 *   - night targets and check results filtered by role and phase
 */
export function projectFor(state: GameState, viewerUserId: string): GameStateProjected {
  const viewer = findByUserId(state, viewerUserId);
  const isJudge = viewer?.isJudge ?? false;
  const isMafiaTeam = viewer?.role === ROLE.MAFIA || viewer?.role === ROLE.DON;
  const isGameOver = state.status === 'finished';
  const isMorning = state.phase === GAME_PHASE.MORNING_ANNOUNCEMENT;

  const participants = state.participants.map((p) => ({
    userId: p.userId,
    nickname: p.nickname,
    avatarUrl: p.avatarUrl,
    seat: p.seat,
    isJudge: p.isJudge,
    isBot: p.isBot,
    role: shouldRevealRole(p, viewer, isJudge, isMafiaTeam, isGameOver) ? p.role : null,
    isAlive: p.isAlive,
    isRemoved: p.isRemoved,
    foulsCount: p.foulsCount,
    hasSpokenThisDay: p.hasSpokenThisDay,
  }));

  const myCheck = (() => {
    if (!viewer) return null;
    if (viewer.role === ROLE.SHERIFF && state.sheriffCheck?.byUserId === viewer.userId) {
      return { targetSeat: state.sheriffCheck.targetSeat, result: state.sheriffCheck.result };
    }
    if (viewer.role === ROLE.DON && state.donCheck?.byUserId === viewer.userId) {
      return { targetSeat: state.donCheck.targetSeat, result: state.donCheck.result };
    }
    return null;
  })();

  // Mafia target visibility: judge always, mafia team during night, everyone in morning.
  const showMafiaTarget = isJudge || isMafiaTeam || isMorning || isGameOver;

  return {
    id: state.id,
    lobbyId: state.lobbyId,
    rulesetSlug: state.rulesetSlug,
    status: state.status,
    phase: state.phase,
    dayNumber: state.dayNumber,
    phaseStartedAt: state.phaseStartedAt?.toISOString() ?? null,
    phaseDeadline: state.phaseDeadline?.toISOString() ?? null,
    participants,
    currentSpeakerSeat: state.currentSpeakerSeat,
    nominationSeats: state.nominationSeats,
    votes: Object.fromEntries([...state.votes].map(([k, v]) => [String(k), v])),
    pendingMafiaTargetSeat: showMafiaTarget ? state.pendingMafiaTargetSeat : null,
    lastNightVictimSeat: state.lastNightVictimSeat,
    myCheckResult: myCheck,
    winner: state.winner,
  };
}

function shouldRevealRole(
  target: GameParticipant,
  viewer: GameParticipant | undefined,
  isJudge: boolean,
  isMafiaTeam: boolean,
  isGameOver: boolean,
): boolean {
  if (isJudge) return true;
  if (isGameOver) return true;
  if (!viewer) return false;
  if (target.userId === viewer.userId) return true;
  if (isMafiaTeam && (target.role === ROLE.MAFIA || target.role === ROLE.DON)) return true;
  return false;
}
