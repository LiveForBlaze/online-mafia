// Phase transitions: the FSM order (nextPhase) and the big phase-resolution
// integrator (applyAdvancePhase). All pure. The speaker-rotation stepper
// (applyNextSpeaker) lives in game.engine.speaker.ts.

import { GAME_PHASE, type GamePhase } from '@mafia/shared';

import { checkWinner, dayStartSeat, killSeat, withFreshDeadline } from './game.engine.shared.js';
import { firstRoleCardPicker, resolveMafiaConsensus } from './game.engine.night.js';
import { findTiedSeats, resolveVote } from './game.engine.voting.js';
import { alivePlayers, type GameState } from './game.state.js';

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
      // Speeches end → если есть выставленные, идём в DAY_VOTE_INTRO
      // (ведущий объявляет порядок), иначе сразу в ночь.
      // Exception (ФИИМ): if a player was disqualified during the speeches
      // — judge-removed, foul-removed, or self-leave — the day's vote is
      // cancelled and the table goes straight to night.
      if (state.disqualifiedThisDay) return GAME_PHASE.NIGHT_MAFIA;
      return state.nominationSeats.length > 0 ? GAME_PHASE.DAY_VOTE_INTRO : GAME_PHASE.NIGHT_MAFIA;
    case GAME_PHASE.DAY_VOTE_INTRO:
      // Дисквал/уход во время дневной фазы отменяет день — никакого
      // голоса и никаких смертей. Покрывает edge-case дисквала ровно в
      // DAY_VOTE_INTRO (между речами и голосованием).
      if (state.disqualifiedThisDay) return GAME_PHASE.NIGHT_MAFIA;
      // ФИИМ для единственной кандидатуры:
      //   - Первый день (dayNumber === 0): голосование НЕ проводится и
      //     игрок НЕ выбывает — сразу в ночь.
      //   - Любой следующий день: игрок выбывает «без голосования» с
      //     последним словом. Killь-mutation выполняется ниже в
      //     applyAdvancePhase ПОСЛЕ этой маршрутизации.
      if (state.nominationSeats.length === 1) {
        return state.dayNumber === 0 ? GAME_PHASE.NIGHT_MAFIA : GAME_PHASE.DAY_LAST_WORD;
      }
      return GAME_PHASE.DAY_VOTE;
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

  // (Очистка nominationSeats при day-1 single nomination сделана НИЖЕ,
  // после вычисления nextPhase — иначе nextPhase читал бы уже пустой
  // массив и не понял бы что это «day 1 + single» кейс.)

  if (state.phase === GAME_PHASE.DAY_VOTE) {
    // ФИИМ: дисквал во время дневной фазы до того, как голосование завершилось,
    // отменяет результат текущего дня. Сразу в ночь, без отстрела.
    if (state.disqualifiedThisDay) {
      next = { ...next, votes: new Map(), nominationSeats: [], tiedSeats: [] };
    } else {
      const eliminatedSeat = resolveVote(state);
      if (eliminatedSeat !== null) {
        // Clear winner — kill + queue last word. Сохраняем `votes`: на
        // фазе DAY_LAST_WORD VotesBreakdown показывает «кто как
        // проголосовал», включая auto-cast'ы тем, кто не голосовал в свой
        // раунд (ФИИМ: их голоса уходят в последнего кандидата —
        // applyNextSpeaker делает это перед resolveVote). Чистим карту
        // позже, в MORNING_ANNOUNCEMENT side-effect.
        next = killSeat(next, eliminatedSeat);
        next = {
          ...next,
          lastWordSeats: [eliminatedSeat],
          lastWordIdx: 0,
          currentSpeakerSeat: eliminatedSeat,
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
        // Карту голосов оставляем для VotesBreakdown в DAY_LAST_WORD.
        next = killSeat(next, eliminatedSeat);
        next = {
          ...next,
          lastWordSeats: [eliminatedSeat],
          lastWordIdx: 0,
          currentSpeakerSeat: eliminatedSeat,
          // Tie-break trail is consumed.
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

  // Выход из DAY_VOTE_INTRO. nextPhase уже решил направление:
  //   - NIGHT_MAFIA: либо дисквал в день, либо day-1 single-nomination
  //     (голосование не проводится, никто не убит). Чистим nominationSeats
  //     чтобы при заходе в ночь не остались «привидения».
  //   - DAY_LAST_WORD: day-2+ single-nomination. ФИИМ-автокилл без
  //     голосования; ставим жертву в lastWordSeats и killSeat.
  if (state.phase === GAME_PHASE.DAY_VOTE_INTRO) {
    if (phase === GAME_PHASE.NIGHT_MAFIA && next.nominationSeats.length >= 1) {
      next = { ...next, nominationSeats: [], votes: new Map(), tiedSeats: [] };
    }
    if (phase === GAME_PHASE.DAY_LAST_WORD && next.nominationSeats.length === 1) {
      const onlyCandidate = next.nominationSeats[0]!;
      next = killSeat(next, onlyCandidate);
      next = {
        ...next,
        lastWordSeats: [onlyCandidate],
        lastWordIdx: 0,
        currentSpeakerSeat: onlyCandidate,
        votes: new Map(),
        nominationSeats: [],
      };
    }
  }

  // Check end-of-game conditions after any kill (vote or night).
  //
  // ФИИМ: даже если убийство закрывает партию (2v2 → 2v1, 3v3 → 3v2),
  // жертва должна получить прощальную минуту / последнее слово ДО того,
  // как объявляется победитель. Поэтому если мы выходим из фазы, где
  // только что произошёл килл с последующей farewell-минутой,
  // откладываем GAME_OVER — повторный checkWinner на выходе из DAY_LAST_WORD
  // (или из DAY_SPEECH после прощальной минуты) дотянет финал.
  const PHASES_WITH_PENDING_FAREWELL: ReadonlyArray<GamePhase> = [
    GAME_PHASE.DAY_VOTE,
    GAME_PHASE.DAY_VOTE_INTRO,
    GAME_PHASE.DAY_REVOTE,
    GAME_PHASE.DAY_SHOOTOUT,
    GAME_PHASE.DAY_LIFT_VOTE,
    GAME_PHASE.NIGHT_SHERIFF,
    GAME_PHASE.MORNING_ANNOUNCEMENT,
  ];
  const winner = checkWinner(next);
  if (winner !== null && !PHASES_WITH_PENDING_FAREWELL.includes(state.phase)) {
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
