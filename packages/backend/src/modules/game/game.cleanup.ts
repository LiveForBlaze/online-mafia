// Game cleanup / participant removal — paths that mark players removed or tear
// a whole game down when a lobby empties or a participant presses "Выйти из
// игры".

import { GAME_PHASE } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { withLock } from '../../lib/mutex.js';
import { broadcastGameState } from './game.broadcast.js';
import { applyJudgeEndGame, applyJudgeRemove } from './game.engine.js';
import { GAME_ERROR } from './game.errors.js';
import { getGame, setGame } from './game.registry.js';
import { syncMediaPermissions } from './game.media-permissions.js';
import { finalizeGameStats } from './game.stats.js';
import { findByUserId, type GameState } from './game.state.js';
import {
  GAME_EVENT_TYPE,
  cleanupBotsAfterGame,
  commit,
  fail,
  loadGameForUser,
  ok,
  persistEvent,
  scheduleFinishedGameCleanup,
  type ActionContext,
  type ServiceResult,
} from './game.service.internal.js';

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
