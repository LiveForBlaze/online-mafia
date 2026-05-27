// Module augmentation for Fastify and @fastify/jwt.
//
// `app.authenticate` is a hook registered in the auth module; declaring it here
// lets every route's `preHandler: [app.authenticate]` typecheck.
//
// FastifyJWT.payload describes the shape of our JWT body, so `request.user`
// is typed correctly after a successful jwtVerify().

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BanRestrictionCode } from '@mafia/shared';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    // Гард для админских роутов — preHandler после authenticate.
    requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    // Фабрика гардов: блокирует роут если у юзера выставлено указанное
    // ограничение (любое из BAN_RESTRICTION кроме SITE_ACCESS — тот режется
    // уже в authenticate).
    requireRestrictionNotSet(
      code: BanRestrictionCode,
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    // Заполняется в authenticate. Маршруты внутри per-restriction preHandler'ов
    // читают эту структуру вместо повторного запроса к БД.
    userFlags?: {
      isAdmin: boolean;
      banRestrictions: BanRestrictionCode[];
    };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // `v` mirrors User.tokenVersion at sign time. authenticate compares it to
    // the DB row's tokenVersion on every request and rejects mismatches —
    // that's how account-deletion (and future "log out everywhere") revokes
    // outstanding JWTs even though they haven't expired yet.
    payload: { sub: string; nickname: string; v: number };
    user: { sub: string; nickname: string; v: number };
  }
}
