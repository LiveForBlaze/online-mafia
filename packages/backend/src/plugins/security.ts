// Cookie + JWT setup and the `authenticate` decorator.
//
// Wrapped with `fastify-plugin` to break Fastify's encapsulation: by default, decorators
// added inside `app.register(plugin)` are visible only to that plugin's children, not to
// sibling plugins. fastify-plugin marks this as "skip encapsulation" so the decorator
// is visible to every later-registered module (auth, lobby, future game, etc.).

import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { COOKIE_NAME } from '../modules/auth/auth.cookies.js';

export const securityPlugin = fp(
  async (app) => {
    await app.register(fastifyCookie);

    await app.register(fastifyJwt, {
      secret: env.JWT_SECRET,
      cookie: {
        cookieName: COOKIE_NAME.SESSION,
        signed: false,
      },
      sign: {
        expiresIn: `${env.SESSION_TTL_SECONDS}s`,
      },
    });

    // preHandler used by routes that require a valid session.
    app.decorate('authenticate', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
    });
  },
  { name: 'security' },
);
