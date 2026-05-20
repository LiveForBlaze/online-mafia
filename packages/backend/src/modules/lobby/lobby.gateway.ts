// Socket.IO handlers for the lobby module.
//
// Players open a socket on the lobby room page and join the `lobby:<id>` channel.
// All future state changes for that lobby are pushed via broadcastLobbyUpdate
// (called from the service layer after each successful mutation).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { prisma } from '../../db/prisma.client.js';

import { attachIO, lobbyRoomName } from './lobby.broadcast.js';

const lobbyJoinPayloadSchema = z.object({
  lobbyId: z.string().uuid(),
});

const CLIENT_LOBBY_JOIN = 'client:lobby_join';
const CLIENT_LOBBY_LEAVE = 'client:lobby_leave';

export function registerLobbyGateway(app: FastifyInstance): void {
  attachIO(app.io);

  app.io.on('connection', (socket) => {
    socket.on(CLIENT_LOBBY_JOIN, async (payload, ack) => {
      const parsed = lobbyJoinPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      const userId = socket.data.user?.sub;
      if (!userId) {
        ack?.({ ok: false, error: 'unauthenticated' });
        return;
      }
      // Membership check: only members of the lobby may subscribe to its events.
      // A non-member could otherwise listen to a private lobby's roster updates.
      const member = await prisma.lobbyMember.findUnique({
        where: { lobbyId_userId: { lobbyId: parsed.data.lobbyId, userId } },
        select: { userId: true },
      });
      if (!member) {
        ack?.({ ok: false, error: 'not_member' });
        return;
      }
      await socket.join(lobbyRoomName(parsed.data.lobbyId));
      ack?.({ ok: true });
    });

    socket.on(CLIENT_LOBBY_LEAVE, async (payload, ack) => {
      const parsed = lobbyJoinPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      await socket.leave(lobbyRoomName(parsed.data.lobbyId));
      ack?.({ ok: true });
    });
  });
}
