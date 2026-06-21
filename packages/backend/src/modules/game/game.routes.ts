// REST routes for the game module.
//
// The realtime channel is Socket.IO; REST is used only for the initial fetch
// of game state when the user first opens /game/:id and for issuing LiveKit tokens.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { BAN_RESTRICTION } from '@mafia/shared';

import { broadcastGameState } from './game.broadcast.js';
import {
  findUserActiveGameId,
  getGameLogForHost,
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
    {
      preHandler: [app.authenticate, app.requireRestrictionNotSet(BAN_RESTRICTION.VIEW_GAMES)],
    },
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

  // Host-only formatted game log for the debrief modal.
  // Rate-limited separately: each additional request loads all game events from DB.
  app.get<{ Params: { id: string } }>(
    '/:id/log',
    { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const result = await getGameLogForHost(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(statusFor(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // Issue a LiveKit access token so the client can join the WebRTC room.
  app.post<{ Params: { id: string } }>(
    '/:id/livekit-token',
    {
      preHandler: [app.authenticate, app.requireRestrictionNotSet(BAN_RESTRICTION.VIEW_GAMES)],
    },
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

  // Admin-only debug log streaming endpoint.
  // Returns the per-game JSONL file as application/x-ndjson.
  app.get<{ Params: { id: string } }>(
    '/:id/debug-log',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      // Defence-in-depth against path traversal: the id is interpolated into a
      // filesystem path, so reject anything that isn't a plain id token (no
      // slashes, dots, or other path metacharacters) before touching the FS.
      // The route is already admin-gated, but a stray `../` must never escape the dir.
      if (!/^[a-zA-Z0-9_-]+$/.test(request.params.id)) {
        return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'log_not_found' });
      }
      const dir = process.env.DEBUG_LOG_DIR ?? '/data/debug-logs';
      const file = join(dir, `${request.params.id}.jsonl`);
      try {
        await stat(file);
      } catch {
        return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'log_not_found' });
      }
      reply.type('application/x-ndjson');
      return reply.send(createReadStream(file));
    },
  );
};
