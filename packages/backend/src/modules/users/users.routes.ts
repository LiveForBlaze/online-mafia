// Public user routes.
//
// Mounted under /api/v1/users.
//   GET /          paginated directory of real players (auth required)
//   GET /:code     public profile by short code (auth required)
//
// Профили auth-gated даже для public-only полей: мы не хотим, чтобы
// директория сканировалась анонимно ботами/скрейперами.

import type { FastifyPluginAsync } from 'fastify';

import {
  findUserByPublicCode,
  listPublicUsers,
  toPublicUserProfile,
} from '../auth/auth.service.js';

const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
} as const;

export const userRoutes: FastifyPluginAsync = async (app) => {
  // Список игроков. ?search=Vasya&limit=50&offset=0
  app.get<{ Querystring: { search?: string; limit?: string; offset?: string } }>(
    '/',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const offset = request.query.offset ? Number(request.query.offset) : undefined;
      const { users, total } = await listPublicUsers({
        search: request.query.search,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      return reply.code(HTTP_STATUS.OK).send({
        users: users.map(toPublicUserProfile),
        total,
      });
    },
  );

  app.get<{ Params: { code: string } }>(
    '/:code',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = await findUserByPublicCode(request.params.code);
      if (!user) {
        return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'user_not_found' });
      }
      return reply.code(HTTP_STATUS.OK).send({ user: toPublicUserProfile(user) });
    },
  );
};

export const userModule: FastifyPluginAsync = async (app) => {
  await app.register(userRoutes);
};
