// HTTP routes of the lobby module.
//
// All routes require an authenticated session (preHandler: [app.authenticate]).
// Routes are thin: validate input, call service, translate Result -> HTTP response.

import type { FastifyPluginAsync } from 'fastify';
import {
  BAN_RESTRICTION,
  createLobbyInputSchema,
  joinLobbyInputSchema,
  kickMemberInputSchema,
  preassignRoleInputSchema,
  setReadyInputSchema,
} from '@mafia/shared';

import {
  claimJudgeSeat,
  closeLobby,
  createLobby,
  getHomeStats,
  getLobbyDetails,
  joinLobby,
  kickMember,
  leaveLobby,
  listPublicLobbies,
  listLiveGames,
  listUserActiveLobbies,
  preassignRole,
  setReady,
} from './lobby.service.js';
import { LOBBY_ERROR, type LobbyErrorCode } from './lobby.errors.js';
import { fillLobbyWithBots } from './lobby.bots.js';
import { createGameFromLobby } from '../game/game.service.js';
import { GAME_ERROR, type GameErrorCode } from '../game/game.errors.js';

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
} as const;

function startGameErrorToHttpStatus(code: GameErrorCode): number {
  switch (code) {
    case GAME_ERROR.LOBBY_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case GAME_ERROR.NOT_LOBBY_HOST:
      return HTTP_STATUS.FORBIDDEN;
    case GAME_ERROR.LOBBY_NOT_READY:
    case GAME_ERROR.LOBBY_ALREADY_STARTED:
      return HTTP_STATUS.CONFLICT;
    default:
      return HTTP_STATUS.CONFLICT;
  }
}

function lobbyErrorToHttpStatus(code: LobbyErrorCode): number {
  switch (code) {
    case LOBBY_ERROR.NOT_FOUND:
    case LOBBY_ERROR.TARGET_NOT_FOUND:
      return HTTP_STATUS.NOT_FOUND;
    case LOBBY_ERROR.NOT_HOST:
    case LOBBY_ERROR.NOT_MEMBER:
    case LOBBY_ERROR.CANNOT_KICK_HOST:
      return HTTP_STATUS.FORBIDDEN;
    case LOBBY_ERROR.NAME_REJECTED:
      return HTTP_STATUS.BAD_REQUEST;
    case LOBBY_ERROR.PASSWORD_REQUIRED:
    case LOBBY_ERROR.WRONG_PASSWORD:
    case LOBBY_ERROR.NOT_OPEN:
    case LOBBY_ERROR.FULL:
    case LOBBY_ERROR.JUDGE_SLOT_TAKEN:
    case LOBBY_ERROR.ALREADY_MEMBER:
    case LOBBY_ERROR.SEAT_CONTENTION:
    case LOBBY_ERROR.ROLE_CAP_REACHED:
    case LOBBY_ERROR.HOST_HAS_ACTIVE_LOBBY:
      return HTTP_STATUS.CONFLICT;
  }
}

// Anti-bot / anti-spam cap: a single user may create at most 50 lobbies per
// 24-hour window. The keyGenerator returns the authenticated user's id so the
// limit is per-account, not per-IP — sharing a household NAT shouldn't matter.
// Falls back to the IP if the request somehow reaches the handler without an
// authenticated user (it shouldn't — preHandler ensures auth — but defence in
// depth).
const LOBBY_CREATE_RATE_LIMIT = {
  max: 50,
  timeWindow: '1 day',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;

// Приватный join вызывает argon2-проверку пароля (~50ms CPU + 19MB памяти).
// Без отдельного лимита это путь к перегрузке CPU перебором паролей.
// 10 попыток в минуту на пользователя (с фолбэком на IP) — достаточно для
// человека, но отрубает перебор.
const LOBBY_JOIN_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;

// Заполнение лобби ботами создаёт до 9 User-строк за запрос. Чтобы хост не
// мог гонять «выкинуть всех → дозалить ботов» бесконечно, ограничиваем
// 10 запросов в минуту на конкретного юзера.
const LOBBY_FILL_BOTS_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;

export const lobbyRoutes: FastifyPluginAsync = async (app) => {
  // ---- Create lobby ----
  app.post(
    '/',
    {
      preHandler: [app.authenticate, app.requireRestrictionNotSet(BAN_RESTRICTION.CREATE_LOBBY)],
      config: { rateLimit: LOBBY_CREATE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = createLobbyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await createLobby(request.user.sub, parsed.data);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.code(HTTP_STATUS.CREATED).send({ lobby: result.data });
    },
  );

  // ---- List public lobbies ----
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lobbies = await listPublicLobbies(request.user.sub);
    return reply.send({ lobbies });
  });

  // ---- List active games (lobbies in IN_GAME state where viewer is a member) ----
  // Declared before /:id so the literal segment wins over the param route.
  app.get('/active', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lobbies = await listUserActiveLobbies(request.user.sub);
    return reply.send({ lobbies });
  });

  // ---- All in-progress public games (для главной: «Идут сейчас»). ----
  // Возвращает чужие IN_GAME лобби тоже, чтобы пользователь увидел какие
  // партии играются вокруг. Просмотр самой партии без участия — отдельная
  // фича (spectator mode) и пока не реализован, но список нужен уже сейчас.
  app.get('/live', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lobbies = await listLiveGames(request.user.sub);
    return reply.send({ lobbies });
  });

  // ---- Home stats (для лендинга: «N открытых · M ждут · K за столом») ----
  // Кладём в lobby-модуль (а не отдельным /stats), потому что вся статистика
  // лендинга про игровое состояние, а не про юзера — модули лежат рядом.
  app.get('/stats', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const stats = await getHomeStats();
    return reply.send(stats);
  });

  // ---- Fill remaining seats with bots (host only) ----
  app.post<{ Params: { id: string } }>(
    '/:id/fill-bots',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: LOBBY_FILL_BOTS_RATE_LIMIT },
    },
    async (request, reply) => {
      const result = await fillLobbyWithBots(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ added: result.added });
    },
  );

  // ---- Get lobby details ----
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await getLobbyDetails(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );

  // ---- Join lobby ----
  app.post<{ Params: { id: string } }>(
    '/:id/join',
    {
      preHandler: [
        app.authenticate,
        app.requireRestrictionNotSet(BAN_RESTRICTION.PARTICIPATE_GAMES),
      ],
      config: { rateLimit: LOBBY_JOIN_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = joinLobbyInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await joinLobby(request.params.id, request.user.sub, parsed.data);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );

  // ---- Claim judge seat (any current member, if judge slot is empty) ----
  app.post<{ Params: { id: string } }>(
    '/:id/claim-judge',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await claimJudgeSeat(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );

  // ---- Leave lobby ----
  app.post<{ Params: { id: string } }>(
    '/:id/leave',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await leaveLobby(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Close lobby (host only) ----
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await closeLobby(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send(result.data);
    },
  );

  // ---- Start game ----
  app.post<{ Params: { id: string } }>(
    '/:id/start',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const result = await createGameFromLobby(request.params.id, request.user.sub);
      if (!result.ok) {
        return reply.code(startGameErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.code(HTTP_STATUS.CREATED).send({ gameId: result.data.gameId });
    },
  );

  // ---- Pre-assign role to a member (host-only dev affordance) ----
  app.post<{ Params: { id: string } }>(
    '/:id/preassign-role',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = preassignRoleInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await preassignRole(
        request.params.id,
        request.user.sub,
        parsed.data.userId,
        parsed.data.role,
      );
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );

  // ---- Toggle the caller's own "Готов" flag ----
  app.post<{ Params: { id: string } }>(
    '/:id/ready',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = setReadyInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await setReady(request.params.id, request.user.sub, parsed.data.ready);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );

  // ---- Kick member (host only) ----
  app.post<{ Params: { id: string } }>(
    '/:id/kick',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = kickMemberInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      const result = await kickMember(request.params.id, request.user.sub, parsed.data.userId);
      if (!result.ok) {
        return reply.code(lobbyErrorToHttpStatus(result.error)).send({ error: result.error });
      }
      return reply.send({ lobby: result.data });
    },
  );
};
