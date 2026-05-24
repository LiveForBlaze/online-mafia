// Pure functions that drive game state forward.
//
// All functions here are intentionally side-effect-free — they take a state and inputs,
// return a new state (or an error). Persistence and broadcasting live in game.service.ts;
// keeping the engine pure makes it trivially testable and avoids accidental ordering bugs.

import {
  DEFAULT_PHASE_DURATION_SEC,
  FOUL_MUTE_THRESHOLD,
  FOUL_REMOVE_THRESHOLD,
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
  // Muted players (3+ fouls) are skipped in the regular speech rotation —
  // they've lost their right to speak per ФИИМ. They retain the right to vote.
  // TODO(ФИИМ-M8): по правилам ФИИМ muted сохраняет право выставить
  // кандидатуру — нужна отдельная судейская команда «дать выставить под mute»
  // (без речи, только жест/UI). Сейчас этой кнопки нет — оставляем как
  // известное расхождение, чинить отдельной сессией.
  const alive = alivePlayers(state).filter(
    (p) => !p.hasSpokenThisDay && p.foulsCount < FOUL_MUTE_THRESHOLD,
  );
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

/**
 * Return the seats that share the top vote count when at least two candidates
 * are tied. An empty array means "no tie to break" — either someone won, or
 * the vote was empty/single-candidate (no shootout needed).
 */
export function findTiedSeats(state: GameState): number[] {
  const tally = new Map<number, number>();
  for (const [, candidateSeat] of state.votes) {
    tally.set(candidateSeat, (tally.get(candidateSeat) ?? 0) + 1);
  }
  if (tally.size < 2) return [];
  let max = -1;
  for (const count of tally.values()) if (count > max) max = count;
  if (max < 1) return [];
  const tied: number[] = [];
  for (const [seat, count] of tally) if (count === max) tied.push(seat);
  return tied.length >= 2 ? tied.sort((a, b) => a - b) : [];
}

// ---- Phase transitions ----

/**
 * Compute the next phase given the current one and the current state.
 * This function is the single source of truth for the FSM order.
 */
export function nextPhase(state: GameState): GamePhase {
  switch (state.phase) {
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return GAME_PHASE.ROLE_DISTRIBUTION;
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return GAME_PHASE.NIGHT_ZERO;
    case GAME_PHASE.NIGHT_ZERO:
      return GAME_PHASE.DAY_SPEECH;
    case GAME_PHASE.DAY_SPEECH:
      // Speeches end → vote if there are nominations, else go to night.
      // Exception (ФИИМ): if a player was disqualified during the speeches
      // — judge-removed, foul-removed, or self-leave — the day's vote is
      // cancelled and the table goes straight to night.
      if (state.disqualifiedThisDay) return GAME_PHASE.NIGHT_MAFIA;
      return state.nominationSeats.length > 0 ? GAME_PHASE.DAY_VOTE : GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_VOTE:
      // After vote resolution one of three outcomes is in `state`:
      //   - lastWordSeats non-empty → clear winner, route to last word
      //   - tiedSeats non-empty     → tie of 2+, enter the shootout
      //   - neither                 → no votes or no winner with no tie, night
      if (state.lastWordSeats.length > 0) return GAME_PHASE.DAY_LAST_WORD;
      if (state.tiedSeats.length >= 2) return GAME_PHASE.DAY_SHOOTOUT;
      return GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_SHOOTOUT:
      // After tied players have spoken, the table revotes — only on the
      // tied seats.
      return GAME_PHASE.DAY_REVOTE;
    case GAME_PHASE.DAY_REVOTE:
      // Three outcomes after revote, mirror of DAY_VOTE plus the ФИИМ
      // "lift all" branch when the table is still split:
      //   - clear winner → DAY_LAST_WORD
      //   - tied again   → DAY_LIFT_VOTE (yes/no on killing everyone tied)
      //   - no votes     → NIGHT_MAFIA
      if (state.lastWordSeats.length > 0) return GAME_PHASE.DAY_LAST_WORD;
      if (state.tiedSeats.length >= 2) return GAME_PHASE.DAY_LIFT_VOTE;
      return GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_LIFT_VOTE:
      // Majority-yes drops every tied seat into lastWordSeats; otherwise the
      // queue is empty and we head to night with no one dying.
      if (state.lastWordSeats.length > 0) return GAME_PHASE.DAY_LAST_WORD;
      return GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_LAST_WORD:
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

// Nomination is judge-driven: the speaker says "выставляю №X" aloud and the
// judge clicks the corresponding seat. The nomination is attributed to the
// current speaker semantically (audit-logged against the judge actor) and a
// new entry is appended to nominationSeats.
//
// Constraints inherited from the speaker context:
//   - phase must be DAY_SPEECH
//   - there must be an active non-farewell speaker (farewell speakers can't
//     nominate from the grave, so the judge can't either while they're on)
//   - target must be alive, non-judge, not already nominated. The speaker
//     IS allowed to nominate themselves — putting yourself up for vote is
//     a legitimate (and sometimes strong) sport-mafia move.
export function applyNominate(
  state: GameState,
  actorUserId: string,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_SPEECH) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (state.farewellSeat !== null) return fail(ENGINE_ERROR.NOT_YOUR_TURN);
  if (state.currentSpeakerSeat === null) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

  const actor = findByUserId(state, actorUserId);
  if (!actor || !actor.isJudge) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);

  // One nomination per speech per ФИИМ — if the current speaker has already
  // had a nomination called from their turn, refuse further ones until the
  // judge advances to the next speaker.
  if (state.lastNominatorSeat === state.currentSpeakerSeat) {
    return fail(ENGINE_ERROR.ALREADY_NOMINATED);
  }

  const target = findBySeat(state, targetSeat);
  if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
  if (state.nominationSeats.includes(targetSeat)) return fail(ENGINE_ERROR.ALREADY_NOMINATED);
  // ФИИМ запрещает самовыставление: игрок не может ставить свою кандидатуру.
  if (targetSeat === state.currentSpeakerSeat) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);

  return ok({
    ...state,
    nominationSeats: [...state.nominationSeats, targetSeat],
    lastNominatorSeat: state.currentSpeakerSeat,
  });
}

export function applyCastVote(
  state: GameState,
  actorUserId: string,
  candidateSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_VOTE && state.phase !== GAME_PHASE.DAY_REVOTE) {
    return fail(ENGINE_ERROR.WRONG_PHASE);
  }
  // Sequential voting: only the candidate of the current round accepts a
  // vote. Players who try to vote for any other nominated seat (or click
  // late after their round has passed) get rejected — they cannot save
  // their ballot for a different candidate.
  const currentRoundCandidate = state.nominationSeats[state.voteRoundIdx];
  if (currentRoundCandidate === undefined) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (candidateSeat !== currentRoundCandidate) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
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
function resolveMafiaConsensus(state: GameState): number | null {
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
  // One check per night — same reasoning as don.
  if (state.sheriffCheck !== null) return fail(ENGINE_ERROR.ALREADY_CHECKED);

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

function nextRoleCardPicker(state: GameState, fromSeat: number): number | null {
  for (let seat = fromSeat + 1; seat <= 10; seat += 1) {
    const p = state.participants.find((x) => x.seat === seat);
    if (p && !p.isRemoved) return seat;
  }
  return null;
}

function firstRoleCardPicker(state: GameState): number | null {
  for (let seat = 1; seat <= 10; seat += 1) {
    const p = state.participants.find((x) => x.seat === seat);
    if (p && !p.isRemoved) return seat;
  }
  return null;
}

// ---- Judge-driven transitions ----

export function applyAdvancePhase(state: GameState): GameState {
  // Block leaving ROLE_DISTRIBUTION while players are still picking — judge
  // can't skip past the reveal modal. Returning state unchanged keeps the
  // call idempotent; the gateway surfaces no error because in practice the
  // judge's button is disabled until picks finish.
  if (state.phase === GAME_PHASE.ROLE_DISTRIBUTION && state.roleCardPickerSeat !== null) {
    return state;
  }

  // Resolve side-effects of the *current* phase before transitioning.
  let next: GameState = { ...state };

  if (state.phase === GAME_PHASE.DAY_VOTE) {
    // ФИИМ: дисквал во время дневной фазы до того, как голосование завершилось,
    // отменяет результат текущего дня. Сразу в ночь, без отстрела.
    if (state.disqualifiedThisDay) {
      next = { ...next, votes: new Map(), nominationSeats: [], tiedSeats: [] };
    } else if (state.nominationSeats.length === 1) {
      // ФИИМ: единственный выставленный кандидат уходит «без голосования» —
      // голосование не проводится, игрок автоматически выбывает.
      const onlyCandidate = state.nominationSeats[0]!;
      next = killSeat(next, onlyCandidate);
      next = {
        ...next,
        lastWordSeats: [onlyCandidate],
        lastWordIdx: 0,
        currentSpeakerSeat: onlyCandidate,
        votes: new Map(),
        nominationSeats: [],
      };
    } else {
      const eliminatedSeat = resolveVote(state);
      if (eliminatedSeat !== null) {
        // Clear winner — kill + queue last word, fall through to clearing
        // nominations / votes below. nextPhase will route to DAY_LAST_WORD.
        next = killSeat(next, eliminatedSeat);
        next = {
          ...next,
          lastWordSeats: [eliminatedSeat],
          lastWordIdx: 0,
          currentSpeakerSeat: eliminatedSeat,
          votes: new Map(),
          nominationSeats: [],
        };
      } else {
        const tied = findTiedSeats(state);
        if (tied.length >= 2) {
          // Tie of 2+ → set up the shootout. The tied seats become the only
          // legal candidates for the upcoming revote, and the first tied seat
          // takes the floor for a short speech.
          next = {
            ...next,
            tiedSeats: tied,
            shootoutSpeakerIdx: 0,
            currentSpeakerSeat: tied[0]!,
            // applyCastVote keys off nominationSeats; pin it to the tied list
            // so revote candidacy is enforced without a separate check.
            nominationSeats: tied,
            votes: new Map(),
          };
        } else {
          // No votes / no tie of 2+ — straight to night.
          next = { ...next, votes: new Map(), nominationSeats: [] };
        }
      }
    }
  }

  if (state.phase === GAME_PHASE.DAY_SHOOTOUT) {
    // Tied players have all spoken; revote opens. tiedSeats stays so the
    // UI keeps highlighting who's still in contention; nominationSeats was
    // already pinned at DAY_VOTE→DAY_SHOOTOUT transition so applyCastVote
    // restricts candidates correctly.
    next = {
      ...next,
      currentSpeakerSeat: null,
      shootoutSpeakerIdx: 0,
    };
  }

  if (state.phase === GAME_PHASE.DAY_REVOTE) {
    if (state.disqualifiedThisDay) {
      // ФИИМ: дисквал во время перестрелки/ревоута тоже отменяет день.
      next = {
        ...next,
        votes: new Map(),
        nominationSeats: [],
        tiedSeats: [],
        shootoutSpeakerIdx: 0,
      };
    } else {
      const eliminatedSeat = resolveVote(state);
      if (eliminatedSeat !== null) {
        // Revote produced a winner. Same flow as DAY_VOTE single-winner case.
        next = killSeat(next, eliminatedSeat);
        next = {
          ...next,
          lastWordSeats: [eliminatedSeat],
          lastWordIdx: 0,
          currentSpeakerSeat: eliminatedSeat,
          // Tie-break trail is consumed.
          votes: new Map(),
          nominationSeats: [],
          tiedSeats: [],
          shootoutSpeakerIdx: 0,
        };
      } else {
        const stillTied = findTiedSeats(state);
        if (stillTied.length >= 2) {
          // Second tie — table proceeds to the "lift all" vote. Keep tiedSeats
          // (the candidates we'll either lift or spare) and prime an empty
          // liftAllVotes map; drop the regular vote/nomination state since
          // we're done with the seat-by-seat ballot.
          next = {
            ...next,
            votes: new Map(),
            nominationSeats: [],
            tiedSeats: stillTied,
            shootoutSpeakerIdx: 0,
            liftAllVotes: new Map(),
          };
        } else {
          // Edge: revote produced no votes / no tie-of-2+ — head straight to
          // night with everyone alive.
          next = {
            ...next,
            votes: new Map(),
            nominationSeats: [],
            tiedSeats: [],
            shootoutSpeakerIdx: 0,
          };
        }
      }
    }
  }

  if (state.phase === GAME_PHASE.DAY_LIFT_VOTE) {
    if (state.disqualifiedThisDay) {
      // ФИИМ: дисквал во время голосования за подъём → день отменён,
      // никто не уезжает, идём в ночь.
      next = {
        ...next,
        liftAllVotes: new Map(),
        tiedSeats: [],
      };
    } else {
      // ФИИМ: «За подъём» проходит, если ЗА проголосовала половина и больше
      // от живых на момент голосования. То есть `yes*2 >= aliveCount`.
      // Абстенции считаются как «против» (молчун = против подъёма), но
      // ровно 50% уже достаточно для подъёма.
      let yes = 0;
      for (const v of next.liftAllVotes.values()) {
        if (v) yes += 1;
      }
      const aliveCount = alivePlayers(next).length;
      const passes = yes * 2 >= aliveCount && yes > 0;
      if (passes && next.tiedSeats.length > 0) {
        // Kill everyone in the tie and queue them all for the last-word phase
        // in seat order. lastWordSeats is consumed one speaker at a time by
        // applyNextSpeaker, so this naturally walks the entire list.
        let killed = next;
        for (const seat of next.tiedSeats) {
          killed = killSeat(killed, seat);
        }
        next = {
          ...killed,
          lastWordSeats: [...next.tiedSeats],
          lastWordIdx: 0,
          currentSpeakerSeat: next.tiedSeats[0]!,
          // ФИИМ: если в Day 1 подъёмом убито 2+, жертва первой ночи не
          // получает ЛХ. Day 1 в нашей внутренней нумерации — dayNumber === 0
          // (он бампается на MORNING_ANNOUNCEMENT).
          firstDayMultiVoteKill:
            next.firstDayMultiVoteKill || (next.dayNumber === 0 && next.tiedSeats.length >= 2),
        };
      }
      // Either branch — consume the lift-vote state.
      next = {
        ...next,
        liftAllVotes: new Map(),
        tiedSeats: [],
      };
    }
  }

  if (state.phase === GAME_PHASE.DAY_LAST_WORD) {
    // Exiting last-word: drop the queue and the speaker pointer so the
    // night phases see a clean slate.
    next = {
      ...next,
      lastWordSeats: [],
      lastWordIdx: 0,
      currentSpeakerSeat: null,
    };
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
    // Tomorrow's morning: resolve the mafia kill (requires consensus across all
    // alive shooters — see resolveMafiaConsensus) and bump the day counter.
    const victimSeat = resolveMafiaConsensus(next);
    if (victimSeat !== null) {
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
      mafiaVotes: new Map(),
      pendingMafiaTargetSeat: null,
      lastNightVictimSeat: null,
      sheriffCheck: null,
      donCheck: null,
      nominationSeats: [],
      votes: new Map(),
      participants: next.participants.map((p) => ({ ...p, hasSpokenThisDay: false })),
      // Clear the per-day disqualification flag — a new day, the rule
      // is evaluated against THIS day's removals only.
      disqualifiedThisDay: false,
    };
  }

  // Now determine the next phase.
  let phase = nextPhase(next);

  // Check end-of-game conditions after any kill (vote or night).
  const winner = checkWinner(next);
  if (winner !== null) {
    return { ...next, phase: GAME_PHASE.GAME_OVER, status: 'finished', winner };
  }

  // Entering any voting phase: reset the round counter so the first ballot
  // is for nominationSeats[0]. Applies to both the initial DAY_VOTE and the
  // tie-break DAY_REVOTE.
  if (phase === GAME_PHASE.DAY_VOTE || phase === GAME_PHASE.DAY_REVOTE) {
    next = { ...next, voteRoundIdx: 0 };
  }

  // Entering ROLE_DISTRIBUTION: seed the card-pick state. First eligible
  // seat takes the floor; the 10-second per-pick timer starts via the
  // withFreshDeadline call at the bottom.
  if (phase === GAME_PHASE.ROLE_DISTRIBUTION && state.phase !== GAME_PHASE.ROLE_DISTRIBUTION) {
    next = {
      ...next,
      roleCardPickerSeat: firstRoleCardPicker(next),
      roleCardsPicked: [],
    };
  }
  // Leaving ROLE_DISTRIBUTION: scrub the picker state so it doesn't leak
  // into the projection during NIGHT_ZERO.
  if (state.phase === GAME_PHASE.ROLE_DISTRIBUTION && phase !== GAME_PHASE.ROLE_DISTRIBUTION) {
    next = { ...next, roleCardPickerSeat: null };
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
function dayStartSeat(state: GameState): number | null {
  const nominal = (state.dayNumber % 10) + 1;
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
 *
 * Also handles DAY_LAST_WORD: walks the lastWordSeats queue one at a time.
 * On the common single-victim case the queue has one entry and applyNextSpeaker
 * exhausts it in one call; multi-victim eliminations (lift-all scenario)
 * play through the queue in seat order before the judge ends the phase.
 */
export function applyNextSpeaker(state: GameState): {
  state: GameState;
  speechesDone: boolean;
} {
  if (state.phase === GAME_PHASE.DAY_LAST_WORD) {
    const nextIdx = state.lastWordIdx + 1;
    if (nextIdx >= state.lastWordSeats.length) {
      // Queue exhausted — leave currentSpeakerSeat alone, the judge will
      // call applyAdvancePhase to exit the phase.
      return { state, speechesDone: true };
    }
    const nextSeat = state.lastWordSeats[nextIdx]!;
    return {
      state: withFreshDeadline(
        { ...state, lastWordIdx: nextIdx, currentSpeakerSeat: nextSeat },
        GAME_PHASE.DAY_LAST_WORD,
      ),
      speechesDone: false,
    };
  }

  if (state.phase === GAME_PHASE.DAY_SHOOTOUT) {
    const nextIdx = state.shootoutSpeakerIdx + 1;
    if (nextIdx >= state.tiedSeats.length) {
      // All tied seats have spoken. Judge calls applyAdvancePhase to exit
      // to DAY_REVOTE.
      return { state, speechesDone: true };
    }
    const nextSeat = state.tiedSeats[nextIdx]!;
    return {
      state: withFreshDeadline(
        { ...state, shootoutSpeakerIdx: nextIdx, currentSpeakerSeat: nextSeat },
        GAME_PHASE.DAY_SHOOTOUT,
      ),
      speechesDone: false,
    };
  }

  // Sequential voting rounds (DAY_VOTE / DAY_REVOTE). Each call advances to
  // the next candidate in nominationSeats. When the judge calls this on the
  // LAST round, the engine auto-casts every remaining alive voter for that
  // last candidate (classic ФИИМ "те кто не проголосовал = за последнего"),
  // then signals speechesDone=true. The judge then calls applyAdvancePhase
  // to resolve the tally.
  if (state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE) {
    const lastRoundIdx = state.nominationSeats.length - 1;
    if (lastRoundIdx < 0) {
      // No nominations → no rounds. Should be impossible given the engine
      // routes DAY_SPEECH → DAY_VOTE only when nominations exist, but stay
      // defensive.
      return { state, speechesDone: true };
    }
    if (state.voteRoundIdx > lastRoundIdx) {
      // Already past the end — nothing more to do here.
      return { state, speechesDone: true };
    }
    if (state.voteRoundIdx === lastRoundIdx) {
      // Closing the final round: pin everyone else's ballot to this candidate.
      // ФИИМ: «не выбравшие — за последнего». При этом сами выставленные
      // кандидаты НЕ принуждаются голосовать друг против друга — их голос
      // остаётся абстенцией, чтобы не было «вынужденного голоса за конкурента».
      const lastCandidate = state.nominationSeats[lastRoundIdx]!;
      const nominees = new Set(state.nominationSeats);
      const newVotes = new Map(state.votes);
      for (const p of alivePlayers(state)) {
        if (p.seat === null) continue;
        if (newVotes.has(p.seat)) continue;
        // Все выставленные seats остаются абстенциями — никого нельзя
        // принудительно прижать к чужой кандидатуре.
        if (nominees.has(p.seat)) continue;
        newVotes.set(p.seat, lastCandidate);
      }
      return {
        state: { ...state, votes: newVotes, voteRoundIdx: state.voteRoundIdx + 1 },
        speechesDone: true,
      };
    }
    // Mid-vote: move to the next candidate's round and refresh the per-round
    // countdown.
    return {
      state: withFreshDeadline({ ...state, voteRoundIdx: state.voteRoundIdx + 1 }, state.phase),
      speechesDone: false,
    };
  }

  if (state.phase !== GAME_PHASE.DAY_SPEECH || state.currentSpeakerSeat === null) {
    return { state, speechesDone: false };
  }

  // Farewell turn ends → consume it and hand the floor to the day's nominal
  // starting seat. The farewell speaker is dead, so they don't get a
  // hasSpokenThisDay flag (alive-player filter already excludes them).
  if (state.farewellSeat === state.currentSpeakerSeat) {
    const startSeat = dayStartSeat(state);
    const cleared: GameState = { ...state, farewellSeat: null, lastNominatorSeat: null };
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
    return {
      state: { ...updated, currentSpeakerSeat: null, lastNominatorSeat: null },
      speechesDone: true,
    };
  }
  // New speaker → fresh 60-second timer, and a fresh nomination quota.
  return {
    state: withFreshDeadline(
      { ...updated, currentSpeakerSeat: next, lastNominatorSeat: null },
      GAME_PHASE.DAY_SPEECH,
    ),
    speechesDone: false,
  };
}

export function applyJudgeFoul(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  // На 4 фоле кнопка фола больше не накручивается автоматически и не
  // удаляет игрока — это сознательная защита от случайного клика. Когда
  // у игрока 4 фола, ведущий принимает решение вручную: либо «−Фол»
  // (откатить случайный), либо «Удалить» (зафиксировать техпотерю).
  if (target.foulsCount >= FOUL_REMOVE_THRESHOLD) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }
  const newFouls = target.foulsCount + 1;
  return ok({
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, foulsCount: newFouls } : p,
    ),
  });
}

// Судья отменяет один фол игроку (если случайно кликнул или передумал).
// Никаких side-effects: просто снижаем счётчик. Не может уйти ниже нуля.
export function applyJudgeUnfoul(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  if (target.foulsCount <= 0) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  return ok({
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, foulsCount: p.foulsCount - 1 } : p,
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
  // ФИИМ: игрок с 3+ фолами уже лишён слова. Кнопка «под фол» для него
  // равноценна добровольной техпотере одним кликом — отклоняем.
  if (actor.foulsCount >= FOUL_MUTE_THRESHOLD) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);

  const newFouls = actor.foulsCount + 1;
  // Никакого auto-remove на 4 фоле — даже если по какой-то причине гард
  // выше пропустил (старая клиентская кнопка / гонка). Ведущий решает
  // удалить игрока сам.
  return ok({
    ...state,
    participants: state.participants.map((p) =>
      p.userId === userId ? { ...p, foulsCount: newFouls } : p,
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

// "Lift all" yes/no vote during DAY_LIFT_VOTE. One ballot per alive
// non-judge player; muted players still vote (muting only affects speech).
// Once cast, the ballot is locked — no overwriting.
export function applyLiftAllVote(
  state: GameState,
  actorUserId: string,
  yes: boolean,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_LIFT_VOTE) return fail(ENGINE_ERROR.WRONG_PHASE);
  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge || !actor.isAlive || actor.isRemoved || actor.seat === null) {
    return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
  }
  if (state.liftAllVotes.has(actor.seat)) return fail(ENGINE_ERROR.ALREADY_VOTED);
  const newVotes = new Map(state.liftAllVotes);
  newVotes.set(actor.seat, yes);
  return ok({ ...state, liftAllVotes: newVotes });
}

// "Лучший Ход" — по правилам ФИИМ его называет ЖЕРТВА ПЕРВОЙ НОЧИ во время
// своей прощальной минуты утром следующего дня (фаза DAY_SPEECH с
// state.farewellSeat === currentSpeakerSeat, dayNumber === 1).
// Дополнительное правило: если в Day 1 голосованием (lift-all) выгнали 2+
// игрока, право ЛХ у жертвы первой ночи аннулируется.
//
// Игрок, выбывший дневным голосованием, ЛХ НЕ делает — это компенсация
// именно за невозможность сыграть из-за ночного убийства.
export function applyBestMoveGuess(
  state: GameState,
  actorUserId: string,
  guessedSeats: number[],
): EngineResult<GameState> {
  // ЛХ доступен только в утреннюю farewell-речь жертвы первой ночи.
  if (state.phase !== GAME_PHASE.DAY_SPEECH) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (state.farewellSeat === null) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (state.farewellSeat !== state.currentSpeakerSeat) return fail(ENGINE_ERROR.NOT_YOUR_TURN);
  // Только жертва первой ночи: dayNumber===1 == день, наступивший после
  // первой ночи (morning bumps dayNumber 0→1).
  if (state.dayNumber !== 1) return fail(ENGINE_ERROR.WRONG_PHASE);
  if (state.firstDayMultiVoteKill) return fail(ENGINE_ERROR.WRONG_PHASE);

  const actor = findByUserId(state, actorUserId);
  if (!actor || actor.isJudge) return fail(ENGINE_ERROR.NOT_LIVE_PLAYER);
  if (actor.seat !== state.farewellSeat) return fail(ENGINE_ERROR.NOT_YOUR_TURN);

  // One guess per elimination — no overwriting on a second submission.
  if (state.bestMoveGuesses.some((g) => g.byUserId === actorUserId)) {
    return fail(ENGINE_ERROR.ALREADY_GUESSED);
  }

  // 1–3 unique seats, all alive non-self, all valid seat numbers.
  if (guessedSeats.length < 1 || guessedSeats.length > 3) {
    return fail(ENGINE_ERROR.INVALID_GUESS);
  }
  const unique = new Set(guessedSeats);
  if (unique.size !== guessedSeats.length) return fail(ENGINE_ERROR.INVALID_GUESS);
  for (const seat of guessedSeats) {
    if (seat === actor.seat) return fail(ENGINE_ERROR.CANNOT_TARGET_SELF);
    const target = findBySeat(state, seat);
    if (!target) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
    if (!target.isAlive || target.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
  }

  return ok({
    ...state,
    bestMoveGuesses: [...state.bestMoveGuesses, { byUserId: actorUserId, guessedSeats }],
  });
}

export function applyJudgeRemove(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  const removedSeat = target.seat;

  // Purge the removed player's footprint from in-flight day / night state so
  // we don't end up with a phantom: dead player still listed as a vote
  // candidate, votes for/by them counted, mafia vote sitting on a seat that
  // no longer exists in the alive set. Without this cleanup, the engine
  // audit found that vote tallies and mafia consensus would silently
  // include data from someone who isn't in the game anymore.
  const newNominations = state.nominationSeats.filter((s) => s !== removedSeat);
  const newVotes = new Map(state.votes);
  if (removedSeat !== null) {
    newVotes.delete(removedSeat);
    for (const [voterSeat, candidateSeat] of newVotes) {
      if (candidateSeat === removedSeat) newVotes.delete(voterSeat);
    }
  }
  const newMafiaVotes = new Map(state.mafiaVotes);
  if (removedSeat !== null) {
    newMafiaVotes.delete(removedSeat);
    for (const [voterSeat, victimSeat] of newMafiaVotes) {
      if (victimSeat === removedSeat) newMafiaVotes.delete(voterSeat);
    }
  }

  const next: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, isRemoved: true, isAlive: false } : p,
    ),
    nominationSeats: newNominations,
    votes: newVotes,
    mafiaVotes: newMafiaVotes,
    // If the removed player was the current speaker, surrender the floor;
    // the judge will advance to the next speaker manually.
    currentSpeakerSeat: state.currentSpeakerSeat === removedSeat ? null : state.currentSpeakerSeat,
    farewellSeat: state.farewellSeat === removedSeat ? null : state.farewellSeat,
    // ФИИМ: дисквал в любой дневной фазе ДО того, как голосование завершилось,
    // отменяет текущий день (никого не убиваем). Покрываем DAY_SPEECH, все
    // фазы голосования, перестрелку и подъём. Удаление в ночные фазы или в
    // DAY_LAST_WORD на ход дня не влияет (он уже разрешён).
    disqualifiedThisDay:
      state.phase === GAME_PHASE.DAY_SPEECH ||
      state.phase === GAME_PHASE.DAY_VOTE ||
      state.phase === GAME_PHASE.DAY_REVOTE ||
      state.phase === GAME_PHASE.DAY_SHOOTOUT ||
      state.phase === GAME_PHASE.DAY_LIFT_VOTE
        ? true
        : state.disqualifiedThisDay,
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
  const isPlayerIntro = state.phase === GAME_PHASE.PLAYER_INTRODUCTION;

  const participants = state.participants.map((p) => ({
    userId: p.userId,
    nickname: p.nickname,
    publicCode: p.publicCode,
    avatarUrl: p.avatarUrl,
    seat: p.seat,
    isJudge: p.isJudge,
    isBot: p.isBot,
    role: shouldRevealRole(p, viewer, isJudge, isMafiaTeam, isGameOver, isPlayerIntro, state)
      ? p.role
      : null,
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

  // Mafia target visibility:
  //   - judge: always (для модерации);
  //   - чёрная команда: всегда видит свой пендинг (для координации ночью);
  //   - все игроки утром: только если ночь закончилась УБИЙСТВОМ (consensus
  //     hit). При промахе показывать «куда чёрные хотели стрелять» — это
  //     утечка их выбора красным; скрываем;
  //   - после game_over: всё открыто.
  const morningHit = isMorning && state.lastNightVictimSeat !== null;
  const showMafiaTarget = isJudge || isMafiaTeam || morningHit || isGameOver;

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
    // During the sequential vote (DAY_VOTE / DAY_REVOTE) the players don't
    // see the full nomination list — the judge calls names aloud and they
    // only react to the candidate of the current round. Project a single-
    // element list with the current candidate and pin voteRoundIdx=0 so
    // their UI naturally shows just "voting for №X". Judge always sees
    // the full picture for orchestration.
    nominationSeats: hideNominationList(state, isJudge)
      ? state.nominationSeats[state.voteRoundIdx] !== undefined
        ? [state.nominationSeats[state.voteRoundIdx]!]
        : []
      : state.nominationSeats,
    votes: Object.fromEntries([...state.votes].map(([k, v]) => [String(k), v])),
    voteRoundIdx: hideNominationList(state, isJudge) ? 0 : state.voteRoundIdx,
    // Whether the current speaker has already had a nomination called.
    // UI uses this to hide the judge's "Выставить" buttons once one click
    // has landed for that speech — one nomination per speech per ФИИМ.
    nominationLockedForSpeaker: state.lastNominatorSeat === state.currentSpeakerSeat,
    pendingMafiaTargetSeat: showMafiaTarget ? state.pendingMafiaTargetSeat : null,
    lastNightVictimSeat: state.lastNightVictimSeat,
    // Drop the field once it has expired so clients don't have to do timer
    // bookkeeping just to fall back to the silent default.
    outOfTurnSpeaker:
      state.outOfTurnSpeaker && state.outOfTurnSpeaker.until > Date.now()
        ? state.outOfTurnSpeaker
        : null,
    farewellSeat: state.farewellSeat,
    // Active last-word speaker (dead from a day-vote elimination) — distinct
    // from farewellSeat (overnight kill speaking the next morning). Media
    // visibility hooks grant audio to whichever of the two is set.
    lastWordSeat: state.lastWordSeats[state.lastWordIdx] ?? null,
    // Tied candidates during DAY_SHOOTOUT / DAY_REVOTE so the UI can
    // highlight who's in contention.
    tiedSeats: state.tiedSeats,
    // Whether this viewer (if mafia/don) has cast their consensus vote this
    // night, so the UI can hide the "shoot" button after their own pick. We
    // deliberately don't expose other shooters' picks here — coordination
    // happens in-game, not via leaked state.
    myMafiaVote:
      viewer && viewer.seat !== null && (viewer.role === ROLE.MAFIA || viewer.role === ROLE.DON)
        ? (state.mafiaVotes.get(viewer.seat) ?? null)
        : null,
    // Public audit trail of Лучший Ход submissions. Shown to everyone since
    // it's a publicly-spoken move; future stats module will score them.
    bestMoveGuesses: state.bestMoveGuesses,
    // Lift-all vote tally — counts only, no per-voter breakdown.
    liftAllTally: liftAllTally(state),
    // The viewer's own lift-all vote so the UI can lock the buttons after
    // they've cast their ballot.
    myLiftAllVote:
      viewer && viewer.seat !== null ? (state.liftAllVotes.get(viewer.seat) ?? null) : null,
    myCheckResult: myCheck,
    // ROLE_DISTRIBUTION card-pick state. roleCardPickerSeat tells everyone
    // whose turn it is; roleCardsPicked lists indices already removed from
    // the wall so the modal can dim/remove them. myRoleCardIndex is the
    // card the viewer themselves picked (or null until they have) so the
    // UI can highlight their flipped card.
    roleCardPickerSeat: state.roleCardPickerSeat,
    roleCardsPicked: state.roleCardsPicked,
    myRoleCardIndex:
      viewer && viewer.seat !== null && state.roleCardsPicked.length >= viewer.seat
        ? (state.roleCardsPicked[viewer.seat - 1] ?? null)
        : null,
    winner: state.winner,
  };
}

function hideNominationList(state: GameState, isJudge: boolean): boolean {
  if (isJudge) return false;
  return state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE;
}

function liftAllTally(state: GameState): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const v of state.liftAllVotes.values()) {
    if (v) yes += 1;
    else no += 1;
  }
  return { yes, no };
}

function shouldRevealRole(
  target: GameParticipant,
  viewer: GameParticipant | undefined,
  isJudge: boolean,
  isMafiaTeam: boolean,
  isGameOver: boolean,
  isPlayerIntro: boolean,
  state?: GameState,
): boolean {
  if (isJudge) return true;
  if (isGameOver) return true;
  // During the intro phase nobody knows their role yet — roles are dealt
  // at the next phase transition. The judge gets the override above.
  if (isPlayerIntro) return false;
  if (!viewer) return false;
  // ROLE_DISTRIBUTION: own role is revealed only after the player has picked
  // their card (seats pick in order, so position i in roleCardsPicked is
  // seat i+1's pick). Until then the viewer's modal shows face-down cards.
  if (state && state.phase === GAME_PHASE.ROLE_DISTRIBUTION) {
    if (target.userId !== viewer.userId) return false;
    if (viewer.seat === null) return false;
    return state.roleCardsPicked.length >= viewer.seat;
  }
  if (target.userId === viewer.userId) return true;
  if (isMafiaTeam && (target.role === ROLE.MAFIA || target.role === ROLE.DON)) return true;
  return false;
}
