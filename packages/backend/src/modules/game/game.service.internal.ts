// Game service — shared internal helpers.
//
// Pieces used by more than one of the split game.service.* modules live here so
// they're defined exactly once: the Result type + ok/fail constructors, the
// GAME_EVENT_TYPE map, the ActionContext type, authorization/load helpers
// (loadGameForUser, requireJudge), persistence (persistEvent, commit), bot
// cleanup, and the finished-game / pick-timer registry-cleanup machinery.

import { Prisma } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { appendDebugLog } from '../../lib/debug-log.js';
import { logger } from '../../lib/logger.js';
import { GAME_ERROR, type GameErrorCode } from './game.errors.js';
import { setGame, getGame, unregisterGame } from './game.registry.js';
import { finalizeGameStats } from './game.stats.js';
import { findByUserId, type GameState } from './game.state.js';

// ---- Result ----

interface ServiceSuccess<T> {
  ok: true;
  data: T;
}
interface ServiceFailure {
  ok: false;
  error: GameErrorCode;
}
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

export const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
export const fail = (error: GameErrorCode): ServiceFailure => ({ ok: false, error });

// ---- Event types persisted to GameEvent.type ----

export const GAME_EVENT_TYPE = {
  GAME_CREATED: 'game_created',
  PHASE_CHANGED: 'phase_changed',
  SPEAKER_ADVANCED: 'speaker_advanced',
  PLAYER_NOMINATED: 'player_nominated',
  PLAYER_UNNOMINATED: 'player_unnominated',
  PLAYER_VOTED: 'player_voted',
  PLAYER_KILLED_BY_VOTE: 'player_killed_by_vote',
  MAFIA_TARGETED: 'mafia_targeted',
  DON_CHECKED: 'don_checked',
  SHERIFF_CHECKED: 'sheriff_checked',
  PLAYER_KILLED_AT_NIGHT: 'player_killed_at_night',
  FOUL_ISSUED: 'foul_issued',
  PLAYER_REMOVED: 'player_removed',
  // Судья снял один фол. Payload: { targetUserId }.
  FOUL_REVOKED: 'foul_revoked',
  // Судья откатил последний шаг (revert). Payload: { restoredPhase }.
  REVERTED: 'reverted',
  // Лучший Ход (best-move guess) cast by an eliminated player during their
  // last word. Payload: { byUserId, guessedSeats: number[] }.
  BEST_MOVE_GUESSED: 'best_move_guessed',
  // Yes/no ballot during DAY_LIFT_VOTE. Payload: { yes: boolean }.
  LIFT_ALL_VOTED: 'lift_all_voted',
  // A player clicked one of the face-down cards in ROLE_DISTRIBUTION.
  // Payload: { cardIndex: number, seat: number, auto: boolean } — `auto`
  // marks server-side timeout picks so the audit log can distinguish them
  // from real clicks.
  ROLE_CARD_PICKED: 'role_card_picked',
  GAME_ENDED: 'game_ended',
} as const;

// ---- Action helpers ----

export interface ActionContext {
  gameId: string;
  userId: string;
}

export function loadGameForUser(ctx: ActionContext): ServiceResult<{ state: GameState }> {
  const state = getGame(ctx.gameId);
  if (!state) return fail(GAME_ERROR.GAME_NOT_FOUND);
  const participant = findByUserId(state, ctx.userId);
  if (!participant) return fail(GAME_ERROR.NOT_PARTICIPANT);
  // Удалённый из игры участник не может слать действия — даже если его сокет
  // остался в комнате. Защита от «removed judge продолжает командовать»
  // и аналога для обычных игроков (вышел через красную кнопку, но клиент жив).
  if (participant.isRemoved) return fail(GAME_ERROR.NOT_PARTICIPANT);
  return ok({ state });
}

export function requireJudge(
  state: GameState,
  userId: string,
): ServiceResult<{ state: GameState }> {
  const participant = findByUserId(state, userId);
  if (!participant?.isJudge) return fail(GAME_ERROR.NOT_JUDGE);
  if (participant.isRemoved) return fail(GAME_ERROR.NOT_JUDGE);
  return ok({ state });
}

export async function persistEvent(
  state: GameState,
  type: string,
  actorUserId: string | null,
  payload: Record<string, unknown>,
): Promise<GameState> {
  await prisma.gameEvent.create({
    data: {
      gameId: state.id,
      seq: state.nextEventSeq,
      phase: state.phase,
      type,
      actorId: actorUserId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
  void appendDebugLog(state.id, {
    cat: 'game',
    type,
    actor:
      actorUserId !== null
        ? (state.participants.find((p) => p.userId === actorUserId)?.nickname ?? null)
        : null,
    userId: actorUserId,
    data: payload,
  });
  return { ...state, nextEventSeq: state.nextEventSeq + 1 };
}

export async function commit(state: GameState): Promise<GameState> {
  setGame(state);
  if (state.status === 'finished') {
    await prisma.game.update({
      where: { id: state.id },
      data: { endedAt: new Date(), winnerTeam: state.winner },
    });
    // Bumps gamesPlayed/wins/losses/winsByRole/gamesAsJudge for each
    // participant exactly once. Guarded by Game.statsApplied inside
    // finalizeGameStats, so retries and double-finishes are safe.
    await finalizeGameStats(state.id);
    // Боты — одноразовые: создаются для конкретного лобби, после игры
    // никому не нужны. Чистим из БД чтобы не копились.
    await cleanupBotsAfterGame(state.id);
    // Free the in-memory registry entry after a grace period (and drop any
    // pending pick timer immediately) so finished games don't accumulate.
    scheduleFinishedGameCleanup(state.id);
  }
  return state;
}

// Удаляет ботов-участников указанной игры. Бот = User.isBot=true. Безопасно
// вызывать многократно (idempotent): если ботов уже нет — no-op. Не падает
// если бот фигурирует в GameEvent.actorId — переписываем actorId в NULL
// перед DELETE User, иначе FK RESTRICT отбьёт удаление.
//
// Порядок важен: сначала разрываем все ссылки, потом сам User.
export async function cleanupBotsAfterGame(gameId: string): Promise<void> {
  const botParticipants = await prisma.gameParticipant.findMany({
    where: { gameId, user: { isBot: true } },
    select: { userId: true },
  });
  if (botParticipants.length === 0) return;
  const botIds = botParticipants.map((p) => p.userId);
  try {
    await prisma.$transaction(async (tx) => {
      // GameEvent.actorId is nullable — NULL'им чтобы FK не блокировал.
      // Эвент-лог сохраняется, "actor" просто становится анонимным.
      await tx.gameEvent.updateMany({
        where: { actorId: { in: botIds } },
        data: { actorId: null },
      });
      await tx.gameParticipant.deleteMany({ where: { userId: { in: botIds } } });
      await tx.lobbyMember.deleteMany({ where: { userId: { in: botIds } } });
      await tx.user.deleteMany({ where: { id: { in: botIds }, isBot: true } });
    });
  } catch (err) {
    // Чистка ботов — best-effort. Если что-то помешало (FK от будущей
    // модели, ручной import) — лучше пропустить и оставить ботов на DB hygiene
    // sweep, чем сорвать commit'игры.
    logger.warn({ err, gameId, botCount: botIds.length }, 'bot cleanup failed; skipping');
  }
}

// ---- Pick-timer + finished-game cleanup registry state ----

// Auto-pick fallback. Humans get the full 10-second window and the server
// then picks the first available card; bots pick a random card almost
// immediately so the queue doesn't drag through 10s of "Bot N is picking".
export const PICK_TIMEOUT_MS = 10_000;
export const BOT_PICK_DELAY_MS = 1500;
export const pickTimers = new Map<string, NodeJS.Timeout>();

export function clearPickTimer(gameId: string): void {
  const t = pickTimers.get(gameId);
  if (t) {
    clearTimeout(t);
    pickTimers.delete(gameId);
  }
}

// A finished game stays in the in-memory registry on purpose so the final
// GAME_OVER broadcast (and any late reconnect) can still find its state. But it
// must not stay forever — otherwise every game ever played accumulates in
// memory. This schedules removal after a grace period and immediately drops any
// pending pick timer for the game. Idempotent: re-finishing re-arms the timer.
const FINISHED_GAME_TTL_MS = 10 * 60_000;
const cleanupTimers = new Map<string, NodeJS.Timeout>();

export function scheduleFinishedGameCleanup(gameId: string): void {
  // A finished game can never be back in ROLE_DISTRIBUTION, so any pending
  // auto-pick timer is dead weight — drop it now rather than waiting for it to
  // fire and no-op.
  clearPickTimer(gameId);
  const existing = cleanupTimers.get(gameId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    unregisterGame(gameId);
    cleanupTimers.delete(gameId);
  }, FINISHED_GAME_TTL_MS);
  // Don't keep the process alive solely to run this cleanup.
  t.unref?.();
  cleanupTimers.set(gameId, t);
}
