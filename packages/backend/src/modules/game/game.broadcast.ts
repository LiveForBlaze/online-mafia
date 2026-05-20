// Shared helper for pushing the current game state to every socket in the room.
//
// Both the Socket.IO gateway (after a client action) and the bot AI (after an
// auto-action) need to broadcast. Keeping the io reference here lets the service
// layer call broadcastGameState() without taking io as a parameter everywhere.

import type { Server as IOServer } from 'socket.io';

import { SERVER_EVENT } from '@mafia/shared';

import { projectFor } from './game.engine.js';
import { getGame } from './game.registry.js';

let ioInstance: IOServer | null = null;

export function attachIO(io: IOServer): void {
  ioInstance = io;
}

export function gameRoomName(gameId: string): string {
  return `game:${gameId}`;
}

/** Send the latest state to every socket in the room, projected for that socket's user. */
export function broadcastGameState(gameId: string): void {
  if (!ioInstance) return;
  const state = getGame(gameId);
  if (!state) return;
  const room = ioInstance.sockets.adapter.rooms.get(gameRoomName(gameId));
  if (!room) return;
  for (const socketId of room) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (!socket) continue;
    const userId = socket.data.user?.sub;
    if (!userId) continue;
    socket.emit(SERVER_EVENT.GAME_STATE_DELTA, projectFor(state, userId));
  }
}
