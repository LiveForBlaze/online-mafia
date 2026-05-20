// Rate limiting against credential stuffing, signup spam, lobby-join DoS.
//
// Global limit is generous; the auth-route plugin further down restricts /login,
// /register and /google/callback because those endpoints either trigger expensive
// argon2 work or affect account integrity.
//
// In-memory store is fine for a single-process VPS. When we scale out we'll
// swap in @fastify/rate-limit's Redis store via REDIS_URL.

import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';

export const rateLimitPlugin = fp(
  async (app) => {
    await app.register(fastifyRateLimit, {
      max: 200,
      timeWindow: '1 minute',
      // Use the IP. Behind a reverse proxy this requires trustProxy: true on
      // Fastify init — see DEPLOYMENT notes.
      keyGenerator: (request) => request.ip,
    });
  },
  { name: 'rate-limit' },
);
