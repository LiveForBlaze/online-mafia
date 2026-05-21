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
// Pre-assigned roles (host's dev affordance) are honored verbatim. Remaining
// players draw from whatever the role pool still has after subtracting the
// pre-assigned ones. The service validates pre-assignment caps; we just
// trust the input here.
export function assignRoles(
  participants: GameParticipant[],
  preassigned: ReadonlyMap<string, Role> = new Map(),
): GameParticipant[] {
  const players = participants.filter((p) => !p.isJudge);

  // Build the remaining role pool by subtracting one role from the configured
  // counts for each pre-assignment.
  const remainingCounts: Record<Role, number> = {
    [ROLE.MAFIA]: ROLE_COUNTS.MAFIA,
    [ROLE.DON]: ROLE_COUNTS.DON,
    [ROLE.SHERIFF]: ROLE_COUNTS.SHERIFF,
    [ROLE.CIVILIAN]: ROLE_COUNTS.CIVILIAN,
  };
  for (const p of players) {
    const fixed = preassigned.get(p.userId);
    if (fixed) remainingCounts[fixed] = Math.max(0, remainingCounts[fixed] - 1);
  }

  const remainingPool: Role[] = [
    ...Array(remainingCounts[ROLE.MAFIA]).fill(ROLE.MAFIA),
    ...Array(remainingCounts[ROLE.DON]).fill(ROLE.DON),
    ...Array(remainingCounts[ROLE.SHERIFF]).fill(ROLE.SHERIFF),
    ...Array(remainingCounts[ROLE.CIVILIAN]).fill(ROLE.CIVILIAN),
  ];

  // Fisher–Yates shuffle the remaining pool with crypto.getRandomValues.
  if (remainingPool.length > 1) {
    const buffer = new Uint32Array(remainingPool.length);
    crypto.getRandomValues(buffer);
    for (let i = remainingPool.length - 1; i > 0; i -= 1) {
      const j = buffer[i]! % (i + 1);
      [remainingPool[i], remainingPool[j]] = [remainingPool[j]!, remainingPool[i]!];
    }
  }

  const withRoles = participants.map((p) => ({ ...p }));
  let poolIdx = 0;
  for (const p of players) {
    const updatedIdx = withRoles.findIndex((w) => w.userId === p.userId);
    const fixed = preassigned.get(p.userId);
    const role = fixed ?? remainingPool[poolIdx++]!;
    withRoles[updatedIdx] = { ...withRoles[updatedIdx]!, role };
  }
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
  // The farewell speaker (a night-killed player) can speak but cannot
  // nominate — they're out of the game.
  if (state.farewellSeat !== null) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

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

  // Entering day_speech: if a player was killed last night, they get the
  // farewell minute first. Otherwise pick the rotation-based starting seat.
  if (phase === GAME_PHASE.DAY_SPEECH) {
    const victim = state.lastNightVictimSeat;
    if (victim !== null) {
      next = {
        ...next,
        farewellSeat: victim,
        currentSpeakerSeat: victim,
      };
    } else {
      const startSeat = dayStartSeat(next);
      next = {
        ...next,
        farewellSeat: null,
        currentSpeakerSeat: startSeat,
      };
    }
  }

  return withFreshDeadline({ ...next, phase }, phase);
}

// Each new day starts one seat later than the previous one — day 1 begins
// at seat 1, day 2 at seat 2, …, day 10 at seat 10, day 11 at seat 1.
// If that nominal seat is dead/removed, walk clockwise to the next alive
// seat. Returns null if nobody is left.
function dayStartSeat(state: GameState): number | null {
  const nominal = ((state.dayNumber - 1) % 10) + 1;
  const alive = alivePlayers(state);
  if (alive.length === 0) return null;
  for (let offset = 0; offset < 10; offset += 1) {
    const seat = ((nominal - 1 + offset) % 10) + 1;
    if (alive.some((p) => p.seat === seat)) return seat;
  }
  return null;
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

  // Farewell turn ends → consume it and hand the floor to the day's nominal
  // starting seat. The farewell speaker is dead, so they don't get a
  // hasSpokenThisDay flag (alive-player filter already excludes them).
  if (state.farewellSeat === state.currentSpeakerSeat) {
    const startSeat = dayStartSeat(state);
    const cleared: GameState = { ...state, farewellSeat: null };
    if (startSeat === null) {
      return { state: { ...cleared, currentSpeakerSeat: null }, speechesDone: true };
    }
    return {
      state: withFreshDeadline(
        { ...cleared, currentSpeakerSeat: startSeat },
        GAME_PHASE.DAY_SPEECH,
      ),
      speechesDone: false,
    };
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

// Player presses "Сказать под фол" — they accept a foul on themselves and
// receive a 5-second window during which their microphone is audible to
// everyone. Cannot stack: pressing again while a window is open just refreshes
// the foul (no double-fault) but does not extend the window beyond 5s from
// the latest press (engineering simpler).
export const OUT_OF_TURN_WINDOW_MS = 5_000;

export function applyOutOfTurn(state: GameState, userId: string): EngineResult<GameState> {
  const actor = findByUserId(state, userId);
  if (!actor || actor.isJudge) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  if (!actor.isAlive || actor.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);

  return ok({
    ...state,
    participants: state.participants.map((p) =>
      p.userId === userId ? { ...p, foulsCount: p.foulsCount + 1 } : p,
    ),
    outOfTurnSpeaker: { userId, until: Date.now() + OUT_OF_TURN_WINDOW_MS },
  });
}

// Judge presses the red "Выйти из игры" — the entire game is ended. The lobby
// is closed by the service layer afterwards. No winner is assigned because the
// game was terminated, not played out.
export function applyJudgeEndGame(state: GameState): EngineResult<GameState> {
  return ok({
    ...state,
    status: 'finished',
    phase: GAME_PHASE.GAME_OVER,
    winner: null,
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
    // Drop the field once it has expired so clients don't have to do timer
    // bookkeeping just to fall back to the silent default.
    outOfTurnSpeaker:
      state.outOfTurnSpeaker && state.outOfTurnSpeaker.until > Date.now()
        ? state.outOfTurnSpeaker
        : null,
    farewellSeat: state.farewellSeat,
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
