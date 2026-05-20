// Singleton Prisma client.
// During development, `tsx watch` reloads the file on every change.
// Without this global trick a new connection pool would be created on every reload
// until PostgreSQL hits `max_connections`.

import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
