// Game module entry point. Registers HTTP routes, Socket.IO handlers, the bot AI,
// and rebuilds any in-flight games from the event log on startup.

import type { FastifyPluginAsync } from 'fastify';

import { startBotTicker, stopBotTicker } from './game.bots.js';
import { registerGameGateway } from './game.gateway.js';
import { gameRoutes } from './game.routes.js';
import { recoverActiveGames } from './game.recovery.js';

export const gameModule: FastifyPluginAsync = async (app) => {
  await app.register(gameRoutes);
  registerGameGateway(app);
  startBotTicker();

  // Rebuild in-memory state for any games that were running when the previous
  // process exited. Fire-and-forget so a slow DB doesn't delay server startup;
  // clients hitting /api/v1/game/:id before recovery completes get a normal
  // game_not_found and can retry. In practice this finishes in well under a
  // second for any realistic number of concurrent games.
  recoverActiveGames().catch((error) => {
    app.log.error({ error }, 'Failed to recover active games');
  });

  app.addHook('onClose', () => {
    stopBotTicker();
  });
};
