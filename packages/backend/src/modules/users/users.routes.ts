// Public user profile routes.
//
// Mounted under /api/v1/users.
//   GET /:code   public profile by short code (auth required; we don't
//                want to make profiles trivially scrapable without a
//                session, even though they expose only public fields)

import type { FastifyPluginAsync } from 'fastify';

import { findUserByPublicCode, toPublicUserProfile } from '../auth/auth.service.js';

const HTTP_STATUS = {
  OK: 200,
  NOT_FOUND: 404,
} as const;

export const userRoutes: FastifyPluginAsync = async (app) => {
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
