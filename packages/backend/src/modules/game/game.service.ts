// Game service — orchestration layer.
//
// Service functions accept the current user, validate authorization, call into the
// pure engine for the actual state transformation, and persist a corresponding
// GameEvent row. They return a discriminated Result so callers (REST routes,
// Socket.IO gateway) can translate failures into the right error code.
//
// State of the in-flight game lives in the in-memory registry; the database is the
// authoritative history (event log) and the source of truth on reload.

import { Prisma } from '@prisma/client';
import { GAME_PHASE, LOBBY, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { appendDebugLog } from '../../lib/debug-log.js';
import { logger } from '../../lib/logger.js';
import { withLock } from '../../lib/mutex.js';
import { broadcastLobbyUpdate } from '../lobby/lobby.broadcast.js';
import { broadcastGameState } from './game.broadcast.js';
import { withFreshDeadline } from './game.engine.js';
import { syncMediaPermissions } from './game.media-permissions.js';

import {
  applyAdvancePhase,
  applyBestMoveGuess,
  applyCastVote,
  applyDonCheck,
  applyJudgeEndGame,
  applyJudgeFoul,
  applyJudgeRemove,
  applyJudgeUnfoul,
  applyJudgeUnnominate,
  applyLiftAllVote,
  applyMafiaTarget,
  applyNextSpeaker,
  applyNominate,
  applyOutOfTurn,
  applyRoleCardPick,
  applySheriffCheck,
  assignRoles,
  projectFor,
} from './game.engine.js';
import { GAME_ERROR, type GameErrorCode } from './game.errors.js';
import {
  getGame,
  popHistorySnapshot,
  pushHistorySnapshot,
  registerGame,
  setGame,
  unregisterGame,
} from './game.registry.js';
import { snapshotState } from './game.snapshot.js';
import { finalizeGameStats } from './game.stats.js';
import { INITIAL_PHASE, findByUserId, type GameParticipant, type GameState } from './game.state.js';

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

const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
const fail = (error: GameErrorCode): ServiceFailure => ({ ok: false, error });

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

// ---- Lifecycle: start game from lobby ----

export async function createGameFromLobby(
  lobbyId: string,
  requesterUserId: string,
): Promise<ServiceResult<{ gameId: string }>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      members: { include: { user: true } },
      game: { select: { id: true } },
    },
  });
  if (!lobby) return fail(GAME_ERROR.LOBBY_NOT_FOUND);
  if (lobby.hostId !== requesterUserId) return fail(GAME_ERROR.NOT_LOBBY_HOST);
  if (lobby.game) return fail(GAME_ERROR.LOBBY_ALREADY_STARTED);
  if (lobby.status !== 'WAITING') return fail(GAME_ERROR.LOBBY_ALREADY_STARTED);
  if (lobby.members.length !== LOBBY.MAX_MEMBERS) return fail(GAME_ERROR.LOBBY_NOT_READY);

  const judge = lobby.members.find((m) => m.isJudge);
  if (!judge) return fail(GAME_ERROR.LOBBY_NOT_READY);
  // Every PLAYER must have flipped "Готов" — judge is the one starting and
  // doesn't toggle ready. Bots are seeded ready=true so they never block.
  if (!lobby.members.every((m) => m.isJudge || m.isReady)) {
    return fail(GAME_ERROR.LOBBY_NOT_READY);
  }

  const initialParticipants: GameParticipant[] = lobby.members.map((m) => ({
    userId: m.user.id,
    nickname: m.user.nickname,
    publicCode: m.user.publicCode,
    avatarUrl: m.user.avatarUrl,
    seat: m.seat,
    isJudge: m.isJudge,
    isBot: m.user.isBot,
    role: null,
    isAlive: true,
    isRemoved: false,
    foulsCount: 0,
    hasSpokenThisDay: false,
  }));

  // Host's dev pre-assignments — engine uses these verbatim and randomizes
  // only the remaining seats. Unknown values are ignored (defensive).
  const KNOWN_ROLES: ReadonlySet<string> = new Set([
    ROLE.CIVILIAN,
    ROLE.SHERIFF,
    ROLE.MAFIA,
    ROLE.DON,
  ]);
  const preassigned = new Map<string, Role>();
  for (const m of lobby.members) {
    if (m.isJudge || !m.preassignedRole) continue;
    if (KNOWN_ROLES.has(m.preassignedRole)) {
      preassigned.set(m.user.id, m.preassignedRole as Role);
    }
  }

  const withRoles = assignRoles(initialParticipants, preassigned);

  // Persist Game + GameParticipants + initial event in one transaction.
  const created = await prisma.$transaction(async (tx) => {
    const game = await tx.game.create({
      data: {
        lobbyId: lobby.id,
        rulesetSlug: lobby.rulesetSlug,
      },
    });
    await tx.gameParticipant.createMany({
      data: withRoles.map((p) => ({
        gameId: game.id,
        userId: p.userId,
        seat: p.seat,
        isJudge: p.isJudge,
        role: p.role,
      })),
    });
    await tx.lobby.update({
      where: { id: lobby.id },
      data: { status: 'IN_GAME' },
    });
    await tx.gameEvent.create({
      data: {
        gameId: game.id,
        seq: 0,
        phase: INITIAL_PHASE,
        type: GAME_EVENT_TYPE.GAME_CREATED,
        payload: { lobbyId: lobby.id, rulesetSlug: lobby.rulesetSlug },
      },
    });
    return game;
  });

  const baseState: GameState = {
    id: created.id,
    lobbyId: lobby.id,
    rulesetSlug: lobby.rulesetSlug,
    status: 'in_progress',
    phase: INITIAL_PHASE,
    dayNumber: 0,
    phaseStartedAt: null,
    phaseDeadline: null,
    participants: withRoles,
    currentSpeakerSeat: null,
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
    nextEventSeq: 1,
  };
  const state = withFreshDeadline(baseState, INITIAL_PHASE);
  registerGame(state);

  // Set initial LiveKit publish permissions for everyone. Most participants probably
  // haven't joined the LiveKit room yet at this moment — the call will succeed for
  // any who have, and silently no-op for the rest. The next phase-advance will catch
  // anyone who joined late.
  void syncMediaPermissions(state);

  // Push the updated lobby (with the new gameId attached) to every lobby socket
  // so non-host players are redirected to /game/:id immediately. Without this,
  // they have to wait for the next polling refetch — felt like a long delay
  // compared to the host's instant navigation.
  void broadcastLobbyUpdate(lobby.id);

  return ok({ gameId: created.id });
}

// ---- Read ----

export async function getProjectedStateFor(
  gameId: string,
  userId: string,
): Promise<ServiceResult<GameStateProjected>> {
  const state = getGame(gameId);
  if (!state) return fail(GAME_ERROR.GAME_NOT_FOUND);

  const participant = findByUserId(state, userId);
  if (!participant) return fail(GAME_ERROR.NOT_PARTICIPANT);

  return ok(projectFor(state, userId));
}

export function isParticipant(gameId: string, userId: string): boolean {
  const state = getGame(gameId);
  if (!state) return false;
  return Boolean(findByUserId(state, userId));
}

// Host-only game log: formatted event lines suitable for a debrief modal.
// Returns null lines for events that are not interesting to a human reader so
// the formatter on the caller side can just .filter(Boolean) them out.
export async function getGameLogForHost(
  gameId: string,
  viewerUserId: string,
): Promise<ServiceResult<{ lines: string[] }>> {
  // In-memory state может отсутствовать: партия закончилась и была
  // выгружена, или сервер пересобрался посреди дебрифа (пользователь
  // жаловался: «Failed to load log» сразу после деплоя). DB всегда хранит
  // и GameParticipant, и GameEvent — собираем лог из них, in-memory state
  // используем только как ускорение.
  const state = getGame(gameId);

  const seatByUser = new Map<string, number | null>();
  const roleByUser = new Map<string, string | null>();
  let viewerIsJudge = false;

  if (state) {
    for (const p of state.participants) {
      seatByUser.set(p.userId, p.seat);
      roleByUser.set(p.userId, p.role);
    }
    const viewer = findByUserId(state, viewerUserId);
    viewerIsJudge = Boolean(viewer?.isJudge);
  } else {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: { select: { userId: true, seat: true, role: true, isJudge: true } },
      },
    });
    if (!game) return fail(GAME_ERROR.GAME_NOT_FOUND);
    for (const p of game.participants) {
      seatByUser.set(p.userId, p.seat);
      roleByUser.set(p.userId, p.role);
      if (p.userId === viewerUserId && p.isJudge) viewerIsJudge = true;
    }
  }

  if (!viewerIsJudge) return fail(GAME_ERROR.NOT_JUDGE);

  const events = await prisma.gameEvent.findMany({
    where: { gameId },
    orderBy: { seq: 'asc' },
  });

  const lines: string[] = [];
  for (const ev of events) {
    const line = formatLogLine(ev, seatByUser, roleByUser);
    if (line) lines.push(line);
  }
  return ok({ lines });
}

function formatLogLine(
  event: { type: string; phase: string; actorId: string | null; payload: unknown },
  seatBy: Map<string, number | null>,
  roleBy: Map<string, string | null>,
): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const actorSeat = event.actorId ? (seatBy.get(event.actorId) ?? null) : null;
  const actorRole = event.actorId ? (roleBy.get(event.actorId) ?? null) : null;
  const roleRu = (r: string | null) =>
    r === 'mafia'
      ? 'мафия'
      : r === 'don'
        ? 'дон'
        : r === 'sheriff'
          ? 'шериф'
          : r === 'civilian'
            ? 'мирный'
            : '';

  switch (event.type) {
    case GAME_EVENT_TYPE.PHASE_CHANGED: {
      const to = String(payload.to ?? '');
      const day = Number(payload.dayNumber ?? 0);
      if (to.startsWith('day_speech') || to === 'day_speech') return `── День ${day} ──`;
      if (to === 'night_mafia') return `── Ночь ${day} ──`;
      if (to === 'game_over') return `── Игра окончена ──`;
      return null;
    }
    case GAME_EVENT_TYPE.MAFIA_TARGETED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `${roleRu(actorRole)} (${actorSeat}) — стреляет в ${target}`;
    }
    case GAME_EVENT_TYPE.DON_CHECKED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `дон (${actorSeat}) — проверяет ${target}`;
    }
    case GAME_EVENT_TYPE.SHERIFF_CHECKED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `шериф (${actorSeat}) — проверяет ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_NOMINATED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `игрок ${actorSeat} — выставляет ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_VOTED: {
      const target = payload.candidateSeat;
      if (actorSeat == null || target == null) return null;
      return `игрок ${actorSeat} — голос за ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_KILLED_BY_VOTE: {
      const seat = payload.seat;
      if (seat == null) return null;
      return `Голосованием выбит игрок ${seat}`;
    }
    case GAME_EVENT_TYPE.PLAYER_KILLED_AT_NIGHT: {
      const seat = payload.seat ?? payload.victimSeat;
      if (seat == null) return 'Ночью никто не погиб';
      return `Ночью убит игрок ${seat}`;
    }
    case GAME_EVENT_TYPE.FOUL_ISSUED: {
      const targetUserId = String(payload.targetUserId ?? '');
      const seat = seatBy.get(targetUserId);
      if (seat == null) return null;
      const self = payload.selfFoul ? ' (под фол)' : '';
      return `Фол игроку ${seat}${self}`;
    }
    case GAME_EVENT_TYPE.PLAYER_REMOVED: {
      const targetUserId = String(payload.targetUserId ?? '');
      const seat = seatBy.get(targetUserId);
      if (seat == null) return null;
      const self = payload.selfRemoved ? ' (сам)' : '';
      return `Удалён игрок ${seat}${self}`;
    }
    case GAME_EVENT_TYPE.GAME_ENDED: {
      const winner = payload.winner;
      return winner ? `Победили: ${winner}` : 'Игра завершена';
    }
    default:
      return null;
  }
}

// Mark a user as removed in the game attached to the given lobby, if any.
// Called when a (non-host) player leaves the lobby — without this, the player
// is still listed as an active participant in the game and the active-game
// auto-redirect drags them back into the game room.
export async function removeUserFromActiveGameForLobby(
  lobbyId: string,
  userId: string,
): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { lobbyId },
    select: { id: true, endedAt: true },
  });
  if (!game || game.endedAt) return;

  await withLock(game.id, async () => {
    const state = getGame(game.id);
    if (!state || state.status === 'finished') return;

    const participant = findByUserId(state, userId);
    if (!participant || participant.isJudge || participant.isRemoved) return;

    const engineResult = applyJudgeRemove(state, userId);
    if (!engineResult.ok) return;

    let next = engineResult.data;
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_REMOVED, userId, {
      targetUserId: userId,
      selfRemoved: true,
      reason: 'left_lobby',
    });
    if (next.status === 'finished') {
      next = await persistEvent(next, GAME_EVENT_TYPE.GAME_ENDED, null, { winner: next.winner });
    }
    setGame(next);
    await commit(next);
    void syncMediaPermissions(next);
  });
}

// End the game attached to the given lobby, if one exists and is still running.
// Called when the host leaves the parent lobby — without this, the game stays
// open in the registry and the host's home page bounces them right back into
// it via the active-game query.
export async function endActiveGameForLobby(lobbyId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { lobbyId },
    select: { id: true, endedAt: true },
  });
  if (!game || game.endedAt) return;

  await prisma.game.update({
    where: { id: game.id },
    data: { endedAt: new Date() },
  });
  // Финализируем статистику — winner=null, поэтому все игроки получат
  // losses+1. Хост ушёл, никто не победил.
  await finalizeGameStats(game.id);
  // Боты этого матча — одноразовые, чистим из БД.
  await cleanupBotsAfterGame(game.id);

  const state = getGame(game.id);
  if (state && state.status !== 'finished') {
    let finished: GameState = {
      ...state,
      status: 'finished',
      phase: GAME_PHASE.GAME_OVER,
      winner: null,
    };
    // Persist a GAME_ENDED event so event-log replay reaches a terminal
    // state cleanly. Without this, recovery would treat the game as still
    // in-progress and try to replay phases past the end.
    finished = await persistEvent(finished, GAME_EVENT_TYPE.GAME_ENDED, null, {
      reason: 'lobby_host_left',
      winner: null,
    });
    setGame(finished);
    void syncMediaPermissions(finished);
    broadcastGameState(game.id);
    // This path commits via setGame (not commit()), so schedule cleanup here too.
    scheduleFinishedGameCleanup(game.id);
  }
}

// Returns the gameId of the user's currently-running game where they are still
// considered an active participant (not isRemoved). Used by the client to
// auto-redirect a returning user back into their in-progress game when they
// land on the home page after a connection drop or page refresh.
//
// Note: dead players (isAlive=false) are still considered "active" here — they
// should remain in the room to watch the rest of the game. Only an explicit
// "Выйти из игры" press (which sets isRemoved=true) removes them entirely.
export async function findUserActiveGameId(userId: string): Promise<string | null> {
  const candidates = await prisma.game.findMany({
    where: {
      endedAt: null,
      participants: { some: { userId } },
    },
    select: { id: true },
    orderBy: { startedAt: 'desc' },
  });

  for (const { id } of candidates) {
    const state = getGame(id);
    if (!state) continue;
    if (state.status === 'finished') continue;
    const participant = findByUserId(state, userId);
    if (participant && !participant.isRemoved) return id;
  }
  return null;
}

// Triggered when a participant presses the red "Выйти из игры" button.
//
// Player: marked as removed (same effect as a judge removing them); other
// players keep playing.
// Judge: the entire game is terminated and the parent lobby is closed. The
// judge slot is irreplaceable — there is no one to continue moderating.
//
// Closing the tab or losing the connection does NOT call this — those users
// can return to the game.
export async function leaveGameAsParticipant(
  ctx: ActionContext,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const me = findByUserId(loaded.data.state, ctx.userId);
    if (!me) return fail(GAME_ERROR.NOT_PARTICIPANT);

    if (me.isJudge) {
      const engineResult = applyJudgeEndGame(loaded.data.state);
      if (!engineResult.ok) return fail(engineResult.error);

      let next = engineResult.data;
      next = await persistEvent(next, GAME_EVENT_TYPE.GAME_ENDED, ctx.userId, {
        reason: 'judge_left',
      });
      setGame(next);
      await commit(next);
      void syncMediaPermissions(next);
      // NOTE: we deliberately do NOT unregister from the in-memory registry here.
      // The status='finished' marker + endedAt in DB are enough to mark the game as
      // ended. Keeping the state in-memory lets the broadcast after this point still
      // find the game so connected sockets receive the final GAME_OVER projection.
      // Without this, frontends get stuck because they never learn the game ended.

      // Close the parent lobby so it disappears from any list and recovery skips it.
      await prisma.lobby.update({
        where: { id: next.lobbyId },
        data: { status: 'CLOSED' },
      });
      return ok(next);
    }

    // Player self-remove path.
    const engineResult = applyJudgeRemove(loaded.data.state, ctx.userId);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    // Drop the LobbyMember row too — without this, the home page still shows
    // the lobby in «Идут сейчас» with a «Вернуться в игру» button for someone
    // who already pressed the red exit. The GameParticipant row stays (with
    // isRemoved=true) so stats / replay / admin still see the player; only
    // the lobby-membership affordance is cleared. Tolerant of the row being
    // already gone (e.g. concurrent kick).
    await prisma.lobbyMember
      .delete({
        where: { lobbyId_userId: { lobbyId: next.lobbyId, userId: ctx.userId } },
      })
      .catch(() => undefined);
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_REMOVED, ctx.userId, {
      targetUserId: ctx.userId,
      selfRemoved: true,
    });
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

// ---- Action helpers ----

interface ActionContext {
  gameId: string;
  userId: string;
}

function loadGameForUser(ctx: ActionContext): ServiceResult<{ state: GameState }> {
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

function requireJudge(state: GameState, userId: string): ServiceResult<{ state: GameState }> {
  const participant = findByUserId(state, userId);
  if (!participant?.isJudge) return fail(GAME_ERROR.NOT_JUDGE);
  if (participant.isRemoved) return fail(GAME_ERROR.NOT_JUDGE);
  return ok({ state });
}

async function persistEvent(
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

async function commit(state: GameState): Promise<GameState> {
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
async function cleanupBotsAfterGame(gameId: string): Promise<void> {
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

// ---- ROLE_DISTRIBUTION card pick ----

// Auto-pick fallback. Humans get the full 10-second window and the server
// then picks the first available card; bots pick a random card almost
// immediately so the queue doesn't drag through 10s of "Bot N is picking".
const PICK_TIMEOUT_MS = 10_000;
const BOT_PICK_DELAY_MS = 1500;
const pickTimers = new Map<string, NodeJS.Timeout>();

function clearPickTimer(gameId: string): void {
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

function scheduleFinishedGameCleanup(gameId: string): void {
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

/** Schedule the auto-pick fallback for the seat that's currently picking.
 *  Re-scheduling is idempotent: each call cancels the previous timer first. */
export function schedulePickTimer(gameId: string, expectedPickerSeat: number): void {
  clearPickTimer(gameId);
  const state = getGame(gameId);
  const picker = state?.participants.find((p) => p.seat === expectedPickerSeat);
  const isBot = picker?.isBot ?? false;
  const t = setTimeout(
    () => {
      void autoPickRoleCard(gameId, expectedPickerSeat, isBot);
    },
    isBot ? BOT_PICK_DELAY_MS : PICK_TIMEOUT_MS,
  );
  pickTimers.set(gameId, t);
}

async function autoPickRoleCard(
  gameId: string,
  expectedPickerSeat: number,
  randomize: boolean,
): Promise<void> {
  const state = getGame(gameId);
  if (!state) return;
  if (state.phase !== GAME_PHASE.ROLE_DISTRIBUTION) return;
  if (state.roleCardPickerSeat !== expectedPickerSeat) return;
  const picker = state.participants.find((p) => p.seat === expectedPickerSeat);
  if (!picker) return;
  const taken = new Set(state.roleCardsPicked);
  const available: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    if (!taken.has(i)) available.push(i);
  }
  if (available.length === 0) return;
  // Bots pick at random for that "I'm choosing" illusion; human timeouts
  // get the first available card as documented for the player.
  const cardIndex = randomize
    ? available[Math.floor(Math.random() * available.length)]!
    : available[0]!;
  const result = await pickRoleCard({ gameId, userId: picker.userId }, cardIndex, true);
  // Auto-picks bypass the gateway's respondAndBroadcast, so we have to push
  // the new state to the room ourselves — otherwise other clients keep
  // showing the bot/timeout's seat as still picking until they reload.
  if (result.ok) broadcastGameState(gameId);
}

export async function pickRoleCard(
  ctx: ActionContext,
  cardIndex: number,
  auto = false,
): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;

    const engineResult = applyRoleCardPick(loaded.data.state, ctx.userId, cardIndex);
    if (!engineResult.ok) return fail(engineResult.error);

    let next = engineResult.data;
    const seat = loaded.data.state.roleCardPickerSeat;
    next = await persistEvent(next, GAME_EVENT_TYPE.ROLE_CARD_PICKED, ctx.userId, {
      cardIndex,
      seat,
      auto,
    });
    const committed = await commit(next);
    // Restart the timer for the next picker, or clear it when picks are done.
    if (committed.roleCardPickerSeat !== null) {
      schedulePickTimer(ctx.gameId, committed.roleCardPickerSeat);
    } else {
      clearPickTimer(ctx.gameId);
    }
    return ok(committed);
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
