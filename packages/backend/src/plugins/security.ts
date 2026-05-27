// Cookie + JWT setup and the `authenticate` decorator.
//
// Wrapped with `fastify-plugin` to break Fastify's encapsulation: by default, decorators
// added inside `app.register(plugin)` are visible only to that plugin's children, not to
// sibling plugins. fastify-plugin marks this as "skip encapsulation" so the decorator
// is visible to every later-registered module (auth, lobby, future game, etc.).

import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { BAN_RESTRICTION, type BanRestrictionCode } from '@mafia/shared';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.client.js';
import { COOKIE_NAME, clearSessionCookie } from '../modules/auth/auth.cookies.js';

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
    //
    // Two-step gate:
    //   1) Verify the JWT signature & expiry (cheap, no DB).
    //   2) Look up the user and require token.v === user.tokenVersion.
    //      Account deletion and similar revocations bump tokenVersion, so
    //      outstanding JWTs are killed even before they expire.
    app.decorate('authenticate', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'unauthenticated' });
      }
      const dbUser = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { tokenVersion: true, isAdmin: true, banRestrictions: true },
      });
      if (!dbUser || dbUser.tokenVersion !== request.user.v) {
        clearSessionCookie(reply);
        return reply.code(401).send({ error: 'session_revoked' });
      }
      // Полная блокировка сайта: site_access перекрывает ВСЁ (включая /auth/me,
      // /auth/refresh). Юзер физически не может пользоваться сайтом до снятия.
      if (dbUser.banRestrictions.includes(BAN_RESTRICTION.SITE_ACCESS)) {
        return reply.code(403).send({ error: 'banned_site_access' });
      }
      // Прикрепляем флаги к request чтобы маршруты могли быстро проверять
      // конкретные ограничения через requireRestrictionNotSet без повторного
      // запроса к БД.
      request.userFlags = {
        isAdmin: dbUser.isAdmin,
        banRestrictions: dbUser.banRestrictions as BanRestrictionCode[],
      };
    });

    // Гард для админских роутов. Использовать как preHandler ПОСЛЕ authenticate.
    app.decorate('requireAdmin', async (request, reply) => {
      if (!request.userFlags?.isAdmin) {
        return reply.code(403).send({ error: 'admin_only' });
      }
    });

    // Фабрика гардов под конкретное ограничение. Возвращает 403 если оно
    // выставлено. site_access уже отрезан в authenticate.
    app.decorate('requireRestrictionNotSet', (code: BanRestrictionCode) => {
      return async (request, reply) => {
        if (request.userFlags?.banRestrictions.includes(code)) {
          return reply.code(403).send({ error: 'banned', restriction: code });
        }
      };
    });
  },
  { name: 'security' },
);
