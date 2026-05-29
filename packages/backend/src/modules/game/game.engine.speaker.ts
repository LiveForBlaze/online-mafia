// Speaker-rotation stepper (applyNextSpeaker): walks the day-speech rotation,
// the last-word queue, the shootout order, and the sequential voting rounds.
// All pure.

import { GAME_PHASE } from '@mafia/shared';

import { dayStartSeat, withFreshDeadline } from './game.engine.shared.js';
import { nextSpeakerSeat } from './game.engine.voting.js';
import { alivePlayers, findBySeat, type GameState } from './game.state.js';

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
