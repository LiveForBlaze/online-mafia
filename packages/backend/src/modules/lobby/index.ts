// Lobby module entry point.
// Routes are registered under the prefix supplied by the caller (server.ts uses /api/v1/lobby).

import type { FastifyPluginAsync } from 'fastify';

import { registerLobbyGateway } from './lobby.gateway.js';
import { lobbyRoutes } from './lobby.routes.js';

export const lobbyModule: FastifyPluginAsync = async (app) => {
  await app.register(lobbyRoutes);
  registerLobbyGateway(app);
};
