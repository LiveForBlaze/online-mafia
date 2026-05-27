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
  targetIsNonAdmin,
} from './admin.service.js';

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
} as const;

// Per-admin rate limit на мутирующие админ-роуты. Защита от: (1) баги в UI
// которые в цикле дёргают рестрикции, (2) компрометированный admin-аккаунт
// или (3) непроверенный скрипт. Read-эндпоинты (GET /lobbies, /users) не
// ограничиваем — там пейджинг и поиск, легко превысить лимит легитимно.
const ADMIN_WRITE_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    request.user?.sub ?? request.ip,
} as const;

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // Все админские роуты — authenticate + requireAdmin.
  const guard = { preHandler: [app.authenticate, app.requireAdmin] };
  // Мутирующие — дополнительно rate-limit.
  const writeGuard = {
    preHandler: [app.authenticate, app.requireAdmin],
    config: { rateLimit: ADMIN_WRITE_RATE_LIMIT },
  };

  // ---- Lobbies ----

  app.get<{ Querystring: { status?: string; search?: string; offset?: string; limit?: string } }>(
    '/lobbies',
    guard,
    async (request, reply) => {
      const status = request.query.status;
      // Дефолт — ACTIVE (WAITING+IN_GAME). Чтобы посмотреть закрытые,
      // админ явно выбирает "ALL" или "CLOSED".
      const safeStatus: 'WAITING' | 'IN_GAME' | 'CLOSED' | 'ALL' | 'ACTIVE' =
        status === 'WAITING' ||
        status === 'IN_GAME' ||
        status === 'CLOSED' ||
        status === 'ALL' ||
        status === 'ACTIVE'
          ? status
          : 'ACTIVE';
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const result = await listLobbiesForAdmin({
        status: safeStatus,
        search: request.query.search,
        offset: Number.isFinite(offset) ? offset : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return reply.send(result);
    },
  );

  app.patch<{ Params: { id: string } }>('/lobbies/:id', writeGuard, async (request, reply) => {
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

  app.delete<{ Params: { id: string } }>('/lobbies/:id', writeGuard, async (request, reply) => {
    const ok = await forceCloseLobbyAsAdmin(request.params.id);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'lobby_not_found' });
    return reply.send({ ok: true });
  });

  // ---- Users ----

  app.get<{
    Querystring: { search?: string; includeBots?: string; offset?: string; limit?: string };
  }>('/users', guard, async (request, reply) => {
    const offset = request.query.offset ? Number(request.query.offset) : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const result = await listUsersForAdmin({
      search: request.query.search,
      includeBots: request.query.includeBots === 'true',
      offset: Number.isFinite(offset) ? offset : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return reply.send(result);
  });

  app.patch<{ Params: { id: string } }>('/users/:id', writeGuard, async (request, reply) => {
    const parsed = adminRenameUserInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(HTTP_STATUS.BAD_REQUEST)
        .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
    }
    // Админ не может переименовать другого админа (включая себя). Иначе
    // компрометированный аккаунт мог бы маскировать действия других админов
    // или сломать UX self-edit пути.
    if (!(await targetIsNonAdmin(request.params.id))) {
      return reply.code(HTTP_STATUS.FORBIDDEN).send({ error: 'cannot_modify_admin' });
    }
    const ok = await renameUserAsAdmin(request.params.id, parsed.data.nickname);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
    return reply.send({ ok: true });
  });

  app.post<{ Params: { id: string } }>(
    '/users/:id/restrictions',
    writeGuard,
    async (request, reply) => {
      const parsed = adminSetRestrictionsInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(HTTP_STATUS.BAD_REQUEST)
          .send({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors });
      }
      // Админа банить нельзя — защищает от self-lockout и admin-on-admin
      // эскалации.
      if (!(await targetIsNonAdmin(request.params.id))) {
        return reply.code(HTTP_STATUS.FORBIDDEN).send({ error: 'cannot_modify_admin' });
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
        {
          targetUserId: request.params.id,
          restrictions: parsed.data.restrictions,
          sockets: closed,
        },
        'admin: applied restrictions and disconnected sockets',
      );
      return reply.send(result);
    },
  );

  app.delete<{ Params: { id: string } }>('/users/:id', writeGuard, async (request, reply) => {
    // Удаление админа запрещено — иначе площадка останется без модератора
    // до следующего бутстрапа из ENV.
    if (!(await targetIsNonAdmin(request.params.id))) {
      return reply.code(HTTP_STATUS.FORBIDDEN).send({ error: 'cannot_modify_admin' });
    }
    const ok = await deleteUserAsAdmin(request.params.id);
    if (!ok) return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
    await app.disconnectUser(request.params.id);
    return reply.send({ ok: true });
  });
};
