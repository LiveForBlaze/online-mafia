// Game actions — player moves (nominate, vote, mafia/don/sheriff night actions,
// lift-all ballot, best-move guess, out-of-turn) and judge controls (advance
// phase/speaker, foul/unfoul, unnominate, revert, remove player).

import { GAME_PHASE } from '@mafia/shared';

import { withLock } from '../../lib/mutex.js';
import { prisma } from '../../db/prisma.client.js';
import {
  applyAdvancePhase,
  applyBestMoveGuess,
  applyCastVote,
  applyDonCheck,
  applyJudgeFoul,
  applyJudgeRemove,
  applyJudgeUnfoul,
  applyJudgeUnnominate,
  applyLiftAllVote,
  applyMafiaTarget,
  applyNextSpeaker,
  applyNominate,
  applyOutOfTurn,
  applySheriffCheck,
} from './game.engine.js';
import { popHistorySnapshot, pushHistorySnapshot, setGame } from './game.registry.js';
import { syncMediaPermissions } from './game.media-permissions.js';
import { snapshotState } from './game.snapshot.js';
import { type GameState } from './game.state.js';
import { schedulePickTimer } from './game.role-distribution.js';
import {
  GAME_EVENT_TYPE,
  clearPickTimer,
  commit,
  fail,
  loadGameForUser,
  ok,
  persistEvent,
  requireJudge,
  type ActionContext,
  type ServiceResult,
} from './game.service.internal.js';

// ---- Player actions ----

export async function nominatePlayer(
  ctx: ActionContext,
  targetSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyNominate(loaded.data.state, ctx.userId, targetSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_NOMINATED, ctx.userId, { targetSeat });
    return ok(await commit(next));
  });
}

export async function judgeUnnominate(
  ctx: ActionContext,
  targetSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    pushHistorySnapshot(loaded.data.state);
    const engineResult = applyJudgeUnnominate(loaded.data.state, targetSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_UNNOMINATED, ctx.userId, { targetSeat });
    return ok(await commit(next));
  });
}

export async function castVote(
  ctx: ActionContext,
  candidateSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyCastVote(loaded.data.state, ctx.userId, candidateSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_VOTED, ctx.userId, { candidateSeat });
    return ok(await commit(next));
  });
}

export async function chooseMafiaTarget(
  ctx: ActionContext,
  targetSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyMafiaTarget(loaded.data.state, ctx.userId, targetSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.MAFIA_TARGETED, ctx.userId, { targetSeat });
    return ok(await commit(next));
  });
}

export async function checkAsDon(
  ctx: ActionContext,
  targetSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyDonCheck(loaded.data.state, ctx.userId, targetSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.DON_CHECKED, ctx.userId, { targetSeat });
    return ok(await commit(next));
  });
}

export async function checkAsSheriff(
  ctx: ActionContext,
  targetSeat: number,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applySheriffCheck(loaded.data.state, ctx.userId, targetSeat);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.SHERIFF_CHECKED, ctx.userId, { targetSeat });
    return ok(await commit(next));
  });
}

// ---- Judge actions ----

export async function judgeAdvancePhase(ctx: ActionContext): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    const before = loaded.data.state;
    // Снимок до изменения — чтобы судья мог откатить случайное нажатие.
    pushHistorySnapshot(before);
    const next = applyAdvancePhase(before);
    let withEvent = await persistEvent(next, GAME_EVENT_TYPE.PHASE_CHANGED, ctx.userId, {
      from: before.phase,
      to: next.phase,
      dayNumber: next.dayNumber,
    });
    if (withEvent.status === 'finished') {
      withEvent = await persistEvent(withEvent, GAME_EVENT_TYPE.GAME_ENDED, null, {
        winner: withEvent.winner,
      });
      setGame(withEvent);
      await commit(withEvent);
      void syncMediaPermissions(withEvent);
      // See note above: keep in registry so the post-finish broadcast can find it.
      return ok(withEvent);
    }
    const committed = await commit(withEvent);
    void syncMediaPermissions(committed);
    // Entering ROLE_DISTRIBUTION arms the per-pick timer for seat 1; leaving
    // it clears any leftover timer (defensive — the engine cleared the
    // picker, but the timer is per-game registry state).
    if (committed.phase === GAME_PHASE.ROLE_DISTRIBUTION && committed.roleCardPickerSeat !== null) {
      schedulePickTimer(ctx.gameId, committed.roleCardPickerSeat);
    } else if (before.phase === GAME_PHASE.ROLE_DISTRIBUTION) {
      clearPickTimer(ctx.gameId);
    }
    return ok(committed);
  });
}

export async function judgeAdvanceSpeaker(ctx: ActionContext): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    pushHistorySnapshot(loaded.data.state);
    const { state: advanced, speechesDone } = applyNextSpeaker(loaded.data.state);
    // Persist a speaker-advance event so recovery can restore the current speaker
    // mid-day rather than starting the round from seat 1.
    const advancedWithEvent = await persistEvent(
      advanced,
      GAME_EVENT_TYPE.SPEAKER_ADVANCED,
      ctx.userId,
      { currentSpeakerSeat: advanced.currentSpeakerSeat },
    );
    if (speechesDone) {
      // Auto-transition to vote (or skip to night if there were no nominations).
      const transitioned = applyAdvancePhase(advancedWithEvent);
      const next = await persistEvent(transitioned, GAME_EVENT_TYPE.PHASE_CHANGED, ctx.userId, {
        from: advancedWithEvent.phase,
        to: transitioned.phase,
      });
      const committed = await commit(next);
      void syncMediaPermissions(committed);
      return ok(committed);
    }
    return ok(await commit(advancedWithEvent));
  });
}

export async function judgeIssueFoul(
  ctx: ActionContext,
  targetUserId: string,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    const engineResult = applyJudgeFoul(loaded.data.state, targetUserId);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.FOUL_ISSUED, ctx.userId, { targetUserId });
    return ok(await commit(next));
  });
}

// Отмена последнего судейского шага. Не event-log replay — мы храним
// stack снимков GameState'a в registry и просто pop'аем последний.
// Игровые события в БД (PHASE_CHANGED, PLAYER_VOTED, …) остаются как
// были — для аудита; следующий advance их перепишет естественным путём.
export async function judgeRevert(ctx: ActionContext): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    const prev = popHistorySnapshot(ctx.gameId);
    if (!prev) return fail('wrong_phase');

    // Snapshot держит свой старый nextEventSeq, но в БД уже записаны
    // события с бóльшими seq (advance, vote, …). Если вызвать persistEvent
    // с prev.nextEventSeq, прилетит P2002 на (gameId, seq) — withLock
    // отпустит, но фронт получит ошибку, и игра ломается. Поэтому seq
    // подтягиваем из БД = max(seq)+1.
    const latest = await prisma.gameEvent.findFirst({
      where: { gameId: ctx.gameId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const nextSeq = (latest?.seq ?? -1) + 1;
    let next: GameState = { ...prev, nextEventSeq: nextSeq };
    // Snapshot включаем В payload REVERTED — это превращает revert в
    // self-contained событие. На recovery после крэша оно полностью
    // восстанавливает pre-revert состояние, не полагаясь на in-memory
    // historyStacks (который улетел вместе с рестартом).
    next = await persistEvent(next, GAME_EVENT_TYPE.REVERTED, ctx.userId, {
      restoredPhase: prev.phase,
      snapshot: snapshotState(prev),
    });
    setGame(next);
    void syncMediaPermissions(next);
    return ok(next);
  });
}

// Снять один фол (защита от случайного клика судьи).
export async function judgeRevokeFoul(
  ctx: ActionContext,
  targetUserId: string,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    const engineResult = applyJudgeUnfoul(loaded.data.state, targetUserId);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.FOUL_REVOKED, ctx.userId, { targetUserId });
    return ok(await commit(next));
  });
}

// "Lift all" yes/no ballot during DAY_LIFT_VOTE.
export async function castLiftAllVote(
  ctx: ActionContext,
  yes: boolean,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyLiftAllVote(loaded.data.state, ctx.userId, yes);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.LIFT_ALL_VOTED, ctx.userId, { yes });
    return ok(await commit(next));
  });
}

// "Best move" (Лучший Ход) — the player giving last word submits 1–3 seats
// they think are the mafia team. Recorded for a future stats / tournament
// module; the engine doesn't score it at game-end yet.
export async function castBestMoveGuess(
  ctx: ActionContext,
  guessedSeats: number[],
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyBestMoveGuess(loaded.data.state, ctx.userId, guessedSeats);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.BEST_MOVE_GUESSED, ctx.userId, {
      guessedSeats,
    });
    return ok(await commit(next));
  });
}

// Player presses "Сказать под фол". Records a self-foul on them and opens a
// 5-second audibility window — the audio policy on every client treats that
// user as audible for the duration even when they're not the speaker.
export async function sayOutOfTurn(ctx: ActionContext): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyOutOfTurn(loaded.data.state, ctx.userId);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.FOUL_ISSUED, ctx.userId, {
      targetUserId: ctx.userId,
      selfFoul: true,
      reason: 'said_out_of_turn',
    });
    return ok(await commit(next));
  });
}

export async function judgeRemovePlayer(
  ctx: ActionContext,
  targetUserId: string,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

    const engineResult = applyJudgeRemove(loaded.data.state, targetUserId);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_REMOVED, ctx.userId, { targetUserId });
    if (next.status === 'finished') {
      next = await persistEvent(next, GAME_EVENT_TYPE.GAME_ENDED, null, { winner: next.winner });
      setGame(next);
      await commit(next);
      void syncMediaPermissions(next);
      // NOTE: we deliberately do NOT unregister from the in-memory registry here.
      // The status='finished' marker + endedAt in DB are enough to mark the game as
      // ended. Keeping the state in-memory lets the broadcast after this point still
      // find the game so connected sockets receive the final GAME_OVER projection.
      // Without this, frontends get stuck because they never learn the game ended.
    } else {
      await commit(next);
      void syncMediaPermissions(next);
    }
    return ok(next);
  });
}
