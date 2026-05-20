// Push lobby state changes to every socket subscribed to the lobby's room.
//
// We deliberately use Prisma directly here instead of calling getLobbyDetails from the
// service — calling into the service would create a circular module graph
// (service → broadcast → service). One DB query per broadcast, projected in memory
// per socket. The per-viewer projection only differs in the `isViewerMember` flag,
// which is computed cheaply.

import type { Server as IOServer } from 'socket.io';

import { SERVER_EVENT } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import { toLobbyDetails } from './lobby.mappers.js';

let ioInstance: IOServer | null = null;

export function attachIO(io: IOServer): void {
  ioInstance = io;
}

export function lobbyRoomName(lobbyId: string): string {
  return `lobby:${lobbyId}`;
}

export async function broadcastLobbyUpdate(lobbyId: string): Promise<void> {
  if (!ioInstance) return;
  const room = ioInstance.sockets.adapter.rooms.get(lobbyRoomName(lobbyId));
  if (!room || room.size === 0) return;

  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      host: { select: { id: true, nickname: true } },
      game: { select: { id: true } },
      members: {
        include: {
          user: { select: { id: true, nickname: true, avatarUrl: true, isBot: true } },
        },
        orderBy: [{ isJudge: 'desc' }, { seat: 'asc' }],
      },
    },
  });
  if (!lobby) return;

  for (const socketId of room) {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (!socket) continue;
    const userId = socket.data.user?.sub;
    if (!userId) continue;
    const details = toLobbyDetails(lobby, userId);
    socket.emit(SERVER_EVENT.LOBBY_UPDATED, { lobby: details });
  }
}
