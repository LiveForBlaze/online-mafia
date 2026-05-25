// Shared helper for pushing the current game state to every socket in the room.
//
// Both the Socket.IO gateway (after a client action) and the bot AI (after an
// auto-action) need to broadcast. Keeping the io reference here lets the service
// layer call broadcastGameState() without taking io as a parameter everywhere.

import type { Server as IOServer } from 'socket.io';

import { SERVER_EVENT } from '@mafia/shared';

import { logger } from '../../lib/logger.js';
import { projectFor } from './game.engine.js';
import { activeGameIds, getGame } from './game.registry.js';

let ioInstance: IOServer | null = null;

export function attachIO(io: IOServer): void {
  ioInstance = io;
}

export function gameRoomName(gameId: string): string {
  return `game:${gameId}`;
}

/**
 * Refresh the in-memory snapshot of a user's nickname / avatar in every
 * active game they're a participant of, then re-broadcast each game's state
 * so connected clients see the change without reloading.
 */
export function refreshUserInActiveGames(
  userId: string,
  patch: { nickname?: string; avatarUrl?: string | null },
): void {
  for (const gameId of activeGameIds()) {
    const state = getGame(gameId);
    if (!state) continue;
    let touched = false;
    for (const p of state.participants) {
      if (p.userId !== userId) continue;
      if (patch.nickname !== undefined && patch.nickname !== p.nickname) {
        p.nickname = patch.nickname;
        touched = true;
      }
      if (patch.avatarUrl !== undefined && patch.avatarUrl !== p.avatarUrl) {
        p.avatarUrl = patch.avatarUrl;
        touched = true;
      }
    }
    if (touched) broadcastGameState(gameId);
  }
}

/**
 * Доставить персональное unlock-уведомление каждому юзеру, у которого
 * в эту партию прибавились ачивки. Используется finalizeGameStats после
 * того, как ачивки уже записаны в БД.
 *
 * Эмитим адресно: в game-room лежат сокеты ВСЕХ участников, но событие
 * получает только тот, чей `socket.data.user.sub` совпадает с ключом в
 * map'е. Это безопаснее (нельзя «подслушать» чужую ачивку — сокет видит
 * только событие, адресованное ему) и проще для клиента (никаких
 * локальных фильтров).
 */
export function emitAchievementsUnlocked(
  gameId: string,
  newlyByUser: Map<string, { id: string; earnedAt: string }[]>,
): void {
  if (newlyByUser.size === 0) return;
  if (!ioInstance) {
    logger.warn({ gameId }, 'emitAchievementsUnlocked: no io instance attached');
    return;
  }
  const room = ioInstance.sockets.adapter.rooms.get(gameRoomName(gameId));
  if (!room) return;
  for (const socketId of room) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (!socket) continue;
    const userId = socket.data.user?.sub;
    if (!userId) continue;
    const achievements = newlyByUser.get(userId);
    if (!achievements || achievements.length === 0) continue;
    socket.emit(SERVER_EVENT.ACHIEVEMENTS_UNLOCKED, { achievements });
  }
}

/** Send the latest state to every socket in the room, projected for that socket's user. */
export function broadcastGameState(gameId: string): void {
  // Each abort path used to be silent, which made dropped phase updates look
  // identical to "everything is fine" from outside. Warn-log them so we can
  // tell from the logs when a game progressed but no one heard about it.
  if (!ioInstance) {
    logger.warn({ gameId }, 'broadcastGameState: no io instance attached');
    return;
  }
  const state = getGame(gameId);
  if (!state) {
    logger.warn({ gameId }, 'broadcastGameState: game not in registry');
    return;
  }
  const room = ioInstance.sockets.adapter.rooms.get(gameRoomName(gameId));
  if (!room) {
    logger.warn({ gameId }, 'broadcastGameState: no sockets in game room');
    return;
  }
  for (const socketId of room) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (!socket) continue;
    const userId = socket.data.user?.sub;
    if (!userId) continue;
    socket.emit(SERVER_EVENT.GAME_STATE_DELTA, projectFor(state, userId));
  }
}
