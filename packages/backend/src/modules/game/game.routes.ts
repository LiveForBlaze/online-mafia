// REST routes for the game module.
//
// The realtime channel is Socket.IO; REST is used only for the initial fetch
// of game state when the user first opens /game/:id and for issuing LiveKit tokens.

import type { FastifyPluginAsync } from 'fastify';

import { broadcastGameState } from './game.broadcast.js';
import {
  findUserActiveGameId,
  getProjectedStateFor,
  leaveGameAsParticipant,
} from './game.service.js';
import { issueLiveKitTokenForGame } from './game.livekit.js';
import { GAME_ERROR, type GameErrorCode } from './game.errors.js';

const HTTP_STATUS = {
  OK: 200,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
} as const;

function statusFor(code: GameErrorCode): number {
  switch (code) {
    case GAME_ERROR.GAME_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case GAME_ERROR.NOT_PARTICIPANT:
      return HTTP_STATUS.FORBIDDEN;
    default:
      return HTTP_STATUS.FORBIDDEN;
  }
}

export const gameRoutes: FastifyPluginAsync = async (app) => {
  // Active game for the current user — used by the home page to auto-redirect
  // a returning player into their in-progress game.
  // Declared before /:id so the literal segment wins over the param route.
  app.get('/active', { preHandler: [app.authenticate] }, async (request, reply) => {
    const gameId = await findUserActiveGameId(request.user.sub);
    return reply.send({ gameId });
  });

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await getProjectedStateFor(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(statusFor(result.error)).send({ error: result.error });
      }
      return reply.send({ game: result.data });
    },
  );

  // Self-removal from an active game. HTTP equivalent of the LEAVE_GAME socket
  // event — used by the home-page 'Покинуть текущую игру' button, where the
  // returning user has no game socket open yet.
  app.post<{ Params: { id: string } }>(
    '/:id/leave',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await leaveGameAsParticipant({
        gameId: request.params.id,
        userId: request.user.sub,
      });
      if (!result.ok) {
        return reply.code(statusFor(result.error)).send({ error: result.error });
      }
      broadcastGameState(request.params.id);
      return reply.send({ ok: true });
    },
  );

  // Issue a LiveKit access token so the client can join the WebRTC room.
  app.post<{ Params: { id: string } }>(
    '/:id/livekit-token',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await issueLiveKitTokenForGame(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(statusFor(result.error)).send({ error: result.error });
      }
      return reply.send({
        token: result.token,
        url: result.url,
        roomName: result.roomName,
      });
    },
  );
};
