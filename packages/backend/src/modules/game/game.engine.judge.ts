// Judge-driven discipline and termination: fouls, unfouls, out-of-turn
// speech, end-game, and player removal (with its full in-flight state
// cleanup). All pure.

import { FOUL_REMOVE_THRESHOLD, GAME_PHASE } from '@mafia/shared';

import { ENGINE_ERROR, checkWinner, fail, ok, type EngineResult } from './game.engine.shared.js';
import { findByUserId, type GameState } from './game.state.js';

export function applyJudgeFoul(state: GameState, targetUserId: string): EngineResult<GameState> {
  const target = findByUserId(state, targetUserId);
  if (!target || target.isJudge) return fail(ENGINE_ERROR.TARGET_NOT_FOUND);
  // Player is already disqualified; cannot accumulate more fouls.
  if (target.foulsCount >= FOUL_REMOVE_THRESHOLD) {
    return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  }
  const newFouls = target.foulsCount + 1;
  const withFouls: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, foulsCount: newFouls } : p,
    ),
  };
  // ФИИМ: 4 фола = техническое поражение. Игрок снимается с игры сразу
  // же, с полной очисткой следов (голоса, выставления, ночные выборы) —
  // те же действия, что и при ручном judge-remove.
  if (newFouls >= FOUL_REMOVE_THRESHOLD) {
    return applyJudgeRemove(withFouls, targetUserId);
  }
  return ok(withFouls);
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
  // «Сказать под фол» имеет смысл только когда у стола есть назначенный
  // говорящий, на которого можно «вмешаться». Это DAY_SPEECH (основной
  // случай), DAY_SHOOTOUT (короткие речи в перестрелке) и DAY_LAST_WORD
  // (последнее слово). В остальных фазах (ночь, голосование, утреннее
  // объявление, ROLE_DISTRIBUTION) кнопка не должна срабатывать — иначе
  // случайный клик мобильного игрока выдаёт ему фол ни за что.
  if (
    state.phase !== GAME_PHASE.DAY_SPEECH &&
    state.phase !== GAME_PHASE.DAY_SHOOTOUT &&
    state.phase !== GAME_PHASE.DAY_LAST_WORD
  ) {
    return fail(ENGINE_ERROR.WRONG_PHASE);
  }
  const actor = findByUserId(state, userId);
  if (!actor || actor.isJudge) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);
  if (!actor.isAlive || actor.isRemoved) return fail(ENGINE_ERROR.TARGET_NOT_LIVE);
  // Уже дисквалифицирован: больше фолов набирать некуда. ФИИМ-исходный
  // гард (запретить при 3+ фолах) был мягче, но пользователь явно просил
  // дать игроку возможность взять 4-й фол как «жертвенный клик» —
  // например чтобы сказать важное в перестрелке. Цена — auto-remove ниже.
  if (actor.foulsCount >= FOUL_REMOVE_THRESHOLD) return fail(ENGINE_ERROR.NOT_AUTHORIZED_ROLE);

  const newFouls = actor.foulsCount + 1;
  const withFouls: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === userId ? { ...p, foulsCount: newFouls } : p,
    ),
    // 5-секундное окно даём всегда, даже при auto-remove на 4-м фоле:
    // outOfTurnSpeaker.userId сохраняется в стейте независимо от
    // isAlive/isRemoved, и аудио-фильтр пропускает голос на эти 5 сек,
    // чтобы игрок успел сказать своё.
    outOfTurnSpeaker: { userId, until: Date.now() + OUT_OF_TURN_WINDOW_MS },
  };
  // ФИИМ: 4 фола = техническое поражение. Зеркалим судейский фол.
  if (newFouls >= FOUL_REMOVE_THRESHOLD) {
    return applyJudgeRemove(withFouls, userId);
  }
  return ok(withFouls);
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

  // ROLE_DISTRIBUTION: если удаляемый игрок СЕЙЧАС держит фишку выбора
  // карты — пропихиваем фишку к следующему ещё не удалённому seat'у,
  // иначе игра встаёт колом: applyAdvancePhase блокирует переход, пока
  // roleCardPickerSeat не null, а applyRoleCardPick не примет клик от
  // другого seat'а. Если уцелевших впереди нет — фишка падает в null
  // (по сути «все выбрали»), и судья может двигать фазу дальше.
  let newRoleCardPickerSeat = state.roleCardPickerSeat;
  if (
    state.phase === GAME_PHASE.ROLE_DISTRIBUTION &&
    state.roleCardPickerSeat === removedSeat &&
    removedSeat !== null
  ) {
    let advanced: number | null = null;
    for (let seat = removedSeat + 1; seat <= 10; seat += 1) {
      const p = state.participants.find((x) => x.seat === seat);
      if (p && !p.isRemoved && p.userId !== targetUserId) {
        advanced = seat;
        break;
      }
    }
    newRoleCardPickerSeat = advanced;
  }

  // Снять «след» удалённого игрока из tie-break / lift-vote состояния. Эти
  // поля и так чистятся при следующем applyAdvancePhase из-за
  // disqualifiedThisDay, но если игрока сняли в DAY_LAST_WORD или в ночной
  // фазе (когда disqualifiedThisDay НЕ ставится) — артефакты могут
  // утечь в следующий день / в проекцию. Сметаем здесь, защитимся.
  const newTiedSeats =
    removedSeat !== null ? state.tiedSeats.filter((s) => s !== removedSeat) : state.tiedSeats;
  const newLastWordSeats =
    removedSeat !== null
      ? state.lastWordSeats.filter((s) => s !== removedSeat)
      : state.lastWordSeats;
  const newLiftAllVotes = new Map(state.liftAllVotes);
  if (removedSeat !== null) newLiftAllVotes.delete(removedSeat);

  const next: GameState = {
    ...state,
    participants: state.participants.map((p) =>
      p.userId === targetUserId ? { ...p, isRemoved: true, isAlive: false } : p,
    ),
    nominationSeats: newNominations,
    votes: newVotes,
    mafiaVotes: newMafiaVotes,
    tiedSeats: newTiedSeats,
    lastWordSeats: newLastWordSeats,
    liftAllVotes: newLiftAllVotes,
    roleCardPickerSeat: newRoleCardPickerSeat,
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
      state.phase === GAME_PHASE.DAY_VOTE_INTRO ||
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
