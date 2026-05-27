// Admin module entry point. Routes are guarded by authenticate + requireAdmin
// inside admin.routes.ts. Admin roster is synced from ENV at server startup
// (see lib/admin-bootstrap.ts).

import type { FastifyPluginAsync } from 'fastify';

import { adminRoutes } from './admin.routes.js';

export const adminModule: FastifyPluginAsync = async (app) => {
  await app.register(adminRoutes);
};
