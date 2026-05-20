// Auth module entry point.
//
// Cookie, JWT, and the `authenticate` decorator are registered globally in the
// `security` plugin (see ../../plugins/security.ts). This module only owns the
// /auth route handlers.

import type { FastifyPluginAsync } from 'fastify';

import { authRoutes } from './auth.routes.js';

export const authModule: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
};
