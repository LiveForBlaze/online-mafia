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
import { LOBBY, type GameStateProjected } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { withLock } from '../../lib/mutex.js';
import { withFreshDeadline } from './game.engine.js';
import { syncMediaPermissions } from './game.media-permissions.js';

import {
  applyAdvancePhase,
  applyCastVote,
  applyDonCheck,
  applyJudgeEndGame,
  applyJudgeFoul,
  applyJudgeRemove,
  applyMafiaTarget,
  applyNextSpeaker,
  applyNominate,
  applySheriffCheck,
  assignRoles,
  projectFor,
} from './game.engine.js';
import { GAME_ERROR, type GameErrorCode } from './game.errors.js';
import { getGame, registerGame, setGame, unregisterGame } from './game.registry.js';
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
  PLAYER_VOTED: 'player_voted',
  PLAYER_KILLED_BY_VOTE: 'player_killed_by_vote',
  MAFIA_TARGETED: 'mafia_targeted',
  DON_CHECKED: 'don_checked',
  SHERIFF_CHECKED: 'sheriff_checked',
  PLAYER_KILLED_AT_NIGHT: 'player_killed_at_night',
  FOUL_ISSUED: 'foul_issued',
  PLAYER_REMOVED: 'player_removed',
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

  const initialParticipants: GameParticipant[] = lobby.members.map((m) => ({
    userId: m.user.id,
    nickname: m.user.nickname,
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

  const withRoles = assignRoles(initialParticipants);

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
    nominationSeats: [],
    votes: new Map(),
    pendingMafiaTargetSeat: null,
    sheriffCheck: null,
    donCheck: null,
    lastNightVictimSeat: null,
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
      unregisterGame(next.id);

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
    next = await persistEvent(next, GAME_EVENT_TYPE.PLAYER_REMOVED, ctx.userId, {
      targetUserId: ctx.userId,
      selfRemoved: true,
    });
    if (next.status === 'finished') {
      next = await persistEvent(next, GAME_EVENT_TYPE.GAME_ENDED, null, { winner: next.winner });
      setGame(next);
      await commit(next);
      void syncMediaPermissions(next);
      unregisterGame(next.id);
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
  return ok({ state });
}

function requireJudge(state: GameState, userId: string): ServiceResult<{ state: GameState }> {
  const participant = findByUserId(state, userId);
  if (!participant?.isJudge) return fail(GAME_ERROR.NOT_JUDGE);
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
  return { ...state, nextEventSeq: state.nextEventSeq + 1 };
}

async function commit(state: GameState): Promise<GameState> {
  setGame(state);
  if (state.status === 'finished') {
    await prisma.game.update({
      where: { id: state.id },
      data: { endedAt: new Date(), winnerTeam: state.winner },
    });
  }
  return state;
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
      unregisterGame(withEvent.id);
      return ok(withEvent);
    }
    const committed = await commit(withEvent);
    void syncMediaPermissions(committed);
    return ok(committed);
  });
}

export async function judgeAdvanceSpeaker(ctx: ActionContext): Promise<ServiceResult<GameState>> {
  return withLock(ctx.gameId, async () => {
    const loaded = loadGameForUser(ctx);
    if (!loaded.ok) return loaded;
    const judgeCheck = requireJudge(loaded.data.state, ctx.userId);
    if (!judgeCheck.ok) return judgeCheck;

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
      unregisterGame(next.id);
    } else {
      await commit(next);
      void syncMediaPermissions(next);
    }
    return ok(next);
  });
}
