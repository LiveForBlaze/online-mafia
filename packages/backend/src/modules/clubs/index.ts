// Clubs module entry point. Routes are registered under the prefix supplied
// by the caller (server.ts uses /api/v1/clubs).

import type { FastifyPluginAsync } from 'fastify';

import { clubRoutes } from './club.routes.js';

export const clubsModule: FastifyPluginAsync = async (app) => {
  await app.register(clubRoutes);
};
