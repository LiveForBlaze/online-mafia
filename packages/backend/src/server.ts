// Fastify application factory.
// Modules (auth, lobby, game, etc.) register their routes via the `app.register(...)` calls below.
// Keep this file thin — only wiring lives here, never business logic.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { env } from './config/env.js';
import { prisma } from './db/prisma.client.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { securityPlugin } from './plugins/security.js';
import { socketioPlugin } from './plugins/socketio.js';
import { authModule } from './modules/auth/index.js';
import { lobbyModule } from './modules/lobby/index.js';
import { gameModule } from './modules/game/index.js';

const API_PREFIX = '/api/v1';

export async function buildServer(): Promise<FastifyInstance> {
  // Fastify creates its own pino logger from these options.
  // For logging outside the Fastify request lifecycle (services, scripts),
  // use the standalone logger exported from ./lib/logger.ts — both share the same format.
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Same redact paths as the standalone logger — keeps secrets out of access logs.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
          '*.idToken',
          '*.jwt',
        ],
        censor: '[Redacted]',
      },
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname',
              },
            },
          }
        : {}),
    },
    disableRequestLogging: false,
    // Trust X-Forwarded-* headers — needed for accurate request.ip behind Caddy/nginx.
    trustProxy: env.NODE_ENV === 'production',
  });

  await app.register(helmet, {
    // Allow inline scripts for development tools. Tighten in production.
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    // In dev we trust any origin (Vite picks free ports). In prod the browser is
    // talking from FRONTEND_URL, not the backend's own URL.
    origin: env.NODE_ENV === 'development' ? true : env.FRONTEND_URL,
    credentials: true,
  });

  await app.register(rateLimitPlugin);

  // Security plugin (cookies, JWT, `authenticate` decorator) is registered first,
  // before any feature module — its decorator must be visible to all of them.
  await app.register(securityPlugin);
  // Socket.IO server (depends on security to verify cookies during the handshake).
  await app.register(socketioPlugin);

  // Liveness probe — the process is up. No deep checks here so the loadbalancer
  // doesn't yank us out for a transient DB hiccup.
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness probe — backend is ready to serve traffic. Verifies DB connectivity.
  app.get('/health/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'database_unavailable' });
    }
  });

  // Feature modules are mounted under /api/v1/<module>.
  await app.register(authModule, { prefix: `${API_PREFIX}/auth` });
  await app.register(lobbyModule, { prefix: `${API_PREFIX}/lobby` });
  await app.register(gameModule, { prefix: `${API_PREFIX}/game` });

  return app;
}
