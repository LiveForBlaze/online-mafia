// Admin HTTP routes. All routes require: authenticate + requireAdmin.
//
// Endpoints:
//   GET    /admin/lobbies                — list with filter/search
//   PATCH  /admin/lobbies/:id            — rename (no AI moderation)
//   DELETE /admin/lobbies/:id            — force close
//   GET    /admin/users                  — list with search
//   PATCH  /admin/users/:id              — rename nickname (no AI moderation)
//   POST   /admin/users/:id/restrictions — set ban restrictions (replace)
//   DELETE /admin/users/:id              — anonymise + lock out

import type { FastifyPluginAsync } from 'fastify';
import { LobbyStatus } from '@prisma/client';
import {
  adminRenameLobbyInputSchema,
  adminRenameUserInputSchema,
  adminSetRestrictionsInputSchema,
} from '@mafia/shared';

import {
  deleteUserAsAdmin,
  forceCloseLobbyAsAdmin,
  listLobbiesForAdmin,
  listUsersForAdmin,
  renameLobbyAsAdmin,
  renameUserAsAdmin,
  setUserRestrictions,
} from './admin.service.js';

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
} as const;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Все админские роуты — authenticate + requireAdmin.
  const guard = { preHandler: [app.authenticate, app.requireAdmin] };

  // ---- Lobbies ----

  app.get<{ Querystring: { status?: string; search?: string } }>(
    '/lobbies',
    guard,
    async (request, reply) => {
      const status = (request.query.status as LobbyStatus | 'ALL' | undefined) ?? 'ALL';
      // Простая валидация — если кто-то прислал мусор, считаем ALL.
      const safeStatus =
        status === 'WAITING' || status === 'IN_GAME' || status === 'CLOSED' ? status : 'ALL';
      const result = await listLobbiesForAdmin({
        status: safeStatus,
        search: request.query.search,
      });
      return reply.send(result);
    },
  );

  app.patch<{ Params: { id: string } }>('/lobbies/:id', guard, async (request, reply) => {
    const parsed = adminRenameLobbyInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }
    const ok = await renameLobbyAsAdmin(request.params.id, parsed.data.name);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'lobby_not_found' });
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/lobbies/:id', guard, async (request, reply) => {
    const ok = await forceCloseLobbyAsAdmin(request.params.id);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'lobby_not_found' });
    return reply.send({ ok: true });
  });

  // ---- Users ----

  app.get<{ Querystring: { search?: string } }>('/users', guard, async (request, reply) => {
    const result = await listUsersForAdmin({ search: request.query.search });
    return reply.send(result);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', guard, async (request, reply) => {
    const parsed = adminRenameUserInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }
    const ok = await renameUserAsAdmin(request.params.id, parsed.data.nickname);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>('/users/:id/restrictions', guard, async (request, reply) => {
    const parsed = adminSetRestrictionsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }
    const result = await setUserRestrictions(
      request.params.id,
      parsed.data.restrictions,
      parsed.data.reason ?? null,
    );
    if (!result) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
    // Принудительный disconnect всех сокетов жертвы — соответствует
    // выбранной пользовательской политике «при бане выкидывать сразу».
    const closed = await app.disconnectUser(request.params.id);
    app.log.info(
      { targetUserId: request.params.id, restrictions: parsed.data.restrictions, sockets: closed },
      'admin: applied restrictions and disconnected sockets',
    );
    return reply.send(result);
  });

  app.delete<{ Params: { id: string } }>('/users/:id', guard, async (request, reply) => {
    const ok = await deleteUserAsAdmin(request.params.id);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
    await app.disconnectUser(request.params.id);
    return reply.send({ ok: true });
  });
};
