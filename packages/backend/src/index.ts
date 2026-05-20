// Backend entry point.
// Loads environment, builds the Fastify app, starts the HTTP server, and registers
// graceful shutdown handlers so in-flight requests finish and DB connections close.

import 'dotenv/config';

import { buildServer } from './server.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.client.js';
import { logger } from './lib/logger.js';

async function main() {
  const server = await buildServer();

  try {
    await server.listen({ port: env.BACKEND_PORT, host: env.BACKEND_HOST });
    logger.info(`Backend listening on http://${env.BACKEND_HOST}:${env.BACKEND_PORT}`);
  } catch (error) {
    logger.error({ error }, 'Failed to start backend');
    process.exit(1);
  }

  // Graceful shutdown: SIGTERM (docker stop / systemd) and SIGINT (Ctrl-C) drain
  // connections so we don't drop in-flight HTTP/WebSocket requests or leak DB pool
  // sockets. Fastify's onClose hooks (bot ticker, Socket.IO, etc.) fire from server.close().
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    try {
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main();
