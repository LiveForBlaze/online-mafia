// Module augmentation for Fastify and @fastify/jwt.
//
// `app.authenticate` is a hook registered in the auth module; declaring it here
// lets every route's `preHandler: [app.authenticate]` typecheck.
//
// FastifyJWT.payload describes the shape of our JWT body, so `request.user`
// is typed correctly after a successful jwtVerify().

import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
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
