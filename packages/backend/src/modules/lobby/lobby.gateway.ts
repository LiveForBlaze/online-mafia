// Socket.IO handlers for the lobby module.
//
// Players open a socket on the lobby room page and join the `lobby:<id>` channel.
// All future state changes for that lobby are pushed via broadcastLobbyUpdate
// (called from the service layer after each successful mutation).

import type { FastifyInstance } from 'fastify';
import { SERVER_EVENT, lobbyChatSendPayloadSchema } from '@mafia/shared';
import { z } from 'zod';

import { prisma } from '../../db/prisma.client.js';

import { attachIO, broadcastLobbyUpdate, lobbyRoomName } from './lobby.broadcast.js';
import { appendLobbyChatMessage, getLobbyChatHistory } from './lobby.chat.js';

const lobbyJoinPayloadSchema = z.object({
  lobbyId: z.string().uuid(),
});

const CLIENT_LOBBY_JOIN = 'client:lobby_join';
const CLIENT_LOBBY_LEAVE = 'client:lobby_leave';
const CLIENT_LOBBY_CHAT_SEND = 'client:lobby_chat_send';

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
        select: { userId: true, isReady: true },
      });
      if (!member) {
        ack?.({ ok: false, error: 'not_member' });
        return;
      }
      // Сначала вступаем в socket-комнату — иначе broadcast ниже (при
      // сбросе isReady) уйдёт всем, КРОМЕ самого вернувшегося, и у него
      // на экране останется устаревший «Готов», пока другие будут видеть
      // его «не готов».
      await socket.join(lobbyRoomName(parsed.data.lobbyId));
      // Returning to the lobby (fresh page mount or socket reconnect) always
      // drops the player back to "not ready". The "Готов" flag is a deliberate
      // act, not a sticky preference — if the player walked off to change
      // their avatar, the host shouldn't be able to start the game without
      // them clicking confirm again.
      if (member.isReady) {
        await prisma.lobbyMember.update({
          where: { lobbyId_userId: { lobbyId: parsed.data.lobbyId, userId } },
          data: { isReady: false },
        });
        void broadcastLobbyUpdate(parsed.data.lobbyId);
      }
      // Replay the current chat buffer to the joiner so they don't land on
      // an empty pane. New broadcasts arrive over the live channel below.
      const history = getLobbyChatHistory(parsed.data.lobbyId);
      for (const message of history) {
        socket.emit(SERVER_EVENT.LOBBY_CHAT_MESSAGE, { message });
      }
      ack?.({ ok: true });
    });

    socket.on(CLIENT_LOBBY_CHAT_SEND, async (payload, ack) => {
      const parsed = lobbyChatSendPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      const userId = socket.data.user?.sub;
      if (!userId) {
        ack?.({ ok: false, error: 'unauthenticated' });
        return;
      }
      // Only lobby members can speak. We re-check on every send rather than
      // trusting the room join — kicked players might still be in the socket
      // room until cleanup completes.
      const member = await prisma.lobbyMember.findUnique({
        where: { lobbyId_userId: { lobbyId: parsed.data.lobbyId, userId } },
        include: {
          user: { select: { nickname: true, publicCode: true } },
        },
      });
      if (!member) {
        ack?.({ ok: false, error: 'not_member' });
        return;
      }
      const message = appendLobbyChatMessage(
        parsed.data.lobbyId,
        {
          userId,
          nickname: member.user.nickname,
          publicCode: member.user.publicCode ?? undefined,
        },
        parsed.data.text,
      );
      app.io.to(lobbyRoomName(parsed.data.lobbyId)).emit(SERVER_EVENT.LOBBY_CHAT_MESSAGE, {
        message,
      });
      ack?.({ ok: true });
    });

    socket.on(CLIENT_LOBBY_LEAVE, async (payload, ack) => {
      const parsed = lobbyJoinPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      await socket.leave(lobbyRoomName(parsed.data.lobbyId));
      // Игрок ушёл с экрана лобби (navigate / close-tab fallback / etc.) —
      // нельзя оставлять его «готов» в чужом списке. Сбрасываем флаг, но
      // не удаляем membership: если он вернётся обратно, всё что нужно — это
      // нажать «Готов» ещё раз. Полный leave идёт через REST /leave.
      const userId = socket.data.user?.sub;
      if (userId) await resetReadyOnDisconnect(parsed.data.lobbyId, userId);
      ack?.({ ok: true });
    });

    // Socket пропадает (close-tab / network drop / explicit disconnect).
    // Используем `disconnecting`, а не `disconnect`, чтобы поймать список
    // комнат socket.rooms ДО его очистки. По каждой lobby:<id> сбрасываем
    // isReady, чтобы хост не пытался стартовать игру с «призраком».
    socket.on('disconnecting', async () => {
      const userId = socket.data.user?.sub;
      if (!userId) return;
      for (const room of socket.rooms) {
        if (!room.startsWith('lobby:')) continue;
        const lobbyId = room.slice('lobby:'.length);
        await resetReadyOnDisconnect(lobbyId, userId);
      }
    });
  });
}

async function resetReadyOnDisconnect(lobbyId: string, userId: string): Promise<void> {
  try {
    const member = await prisma.lobbyMember.findUnique({
      where: { lobbyId_userId: { lobbyId, userId } },
      select: { isReady: true },
    });
    if (!member?.isReady) return;
    await prisma.lobbyMember.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { isReady: false },
    });
    void broadcastLobbyUpdate(lobbyId);
  } catch {
    // member могли удалить параллельно (через REST /leave). Игнорим —
    // broadcast от того, кто реально удалял, всё равно дойдёт.
  }
}
