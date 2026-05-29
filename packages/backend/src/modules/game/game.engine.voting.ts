// Day-speech speaker rotation, nomination, sequential voting, tie detection,
// lift-all voting, and the Лучший Ход guess. All pure.

import { FOUL_MUTE_THRESHOLD, GAME_PHASE } from '@mafia/shared';

import { ENGINE_ERROR, fail, ok, type EngineResult } from './game.engine.shared.js';
import { alivePlayers, findBySeat, findByUserId, type GameState } from './game.state.js';

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
  // Самовыставление разрешено: иногда игрок просит судью «поставьте меня»
  // как тактический ход (заявка на доверие, желание дать свою защиту перед
  // голосованием). Формально ФИИМ это ограничивает, но за столом такое
  // случается, и игрок не должен оказываться без рычага.

  return ok({
    ...state,
    nominationSeats: [...state.nominationSeats, targetSeat],
    lastNominatorSeat: state.currentSpeakerSeat,
  });
}

/**
 * Judge unnominates a seat. Used when a nomination was called by mistake
 * or the speaker withdraws it. Allowed before voting begins (DAY_SPEECH
 * and DAY_VOTE_INTRO). The "one-nomination-per-speech" lock is cleared so
 * the current speaker may nominate again within the same speech if they
 * choose to.
 */
export function applyJudgeUnnominate(
  state: GameState,
  targetSeat: number,
): EngineResult<GameState> {
  if (state.phase !== GAME_PHASE.DAY_SPEECH && state.phase !== GAME_PHASE.DAY_VOTE_INTRO) {
    return fail(ENGINE_ERROR.WRONG_PHASE);
  }
  if (!state.nominationSeats.includes(targetSeat)) {
    return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  }
  return ok({
    ...state,
    nominationSeats: state.nominationSeats.filter((s) => s !== targetSeat),
    // Освобождаем лок «один раз за речь» — у нас нет точного мэппинга
    // «кто кого выставил», поэтому судейская отмена сбрасывает блок для
    // текущего спикера универсально.
    lastNominatorSeat: null,
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
