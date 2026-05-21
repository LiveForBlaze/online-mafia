// Socket.IO plugin.
//
// Attaches a Socket.IO server to the underlying Fastify HTTP server and
// authenticates every connection by verifying the session JWT from the cookie.
//
// Wrapped with fastify-plugin so the `app.io` decoration is visible to feature
// modules registered after this plugin.

import fp from 'fastify-plugin';
import { Server as IOServer, type Socket as IOSocket } from 'socket.io';

import { env } from '../config/env.js';
import { prisma } from '../db/prisma.client.js';
import { COOKIE_NAME } from '../modules/auth/auth.cookies.js';

declare module 'fastify' {
  interface FastifyInstance {
    io: IOServer;
  }
}

// What we store on each authenticated socket. Mirrors the JWT payload.
export interface SocketUser {
  sub: string;
  nickname: string;
  v: number;
}

declare module 'socket.io' {
  interface SocketData {
    user: SocketUser;
  }
}

export type AuthenticatedSocket = IOSocket;

/** Parse a `Cookie` header into a plain map. Robust against missing values and spaces. */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result[trimmed] = '';
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export const socketioPlugin = fp(
  async (app) => {
    const io = new IOServer(app.server, {
      cors: { origin: env.FRONTEND_URL, credentials: true },
      // Keep the default transports (polling + websocket) — Socket.IO falls back gracefully.
    });

    io.use(async (socket, next) => {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie);
      const token = cookies[COOKIE_NAME.SESSION];
      if (!token) {
        next(new Error('unauthenticated'));
        return;
      }
      let payload: SocketUser;
      try {
        payload = app.jwt.verify<SocketUser>(token);
      } catch {
        next(new Error('invalid_token'));
        return;
      }
      // Same revocation gate as the HTTP authenticate decorator: compare the
      // JWT's `v` against the DB row's tokenVersion. We only check at connect
      // time — long-lived games run for ~60 minutes so a stricter per-event
      // check would add a DB lookup per game action; if that gap matters later,
      // add a periodic re-verify hook to disconnect stale sockets.
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tokenVersion: true },
      });
      if (!dbUser || dbUser.tokenVersion !== payload.v) {
        next(new Error('session_revoked'));
        return;
      }
      socket.data.user = payload;
      next();
    });

    app.decorate('io', io);

    app.addHook('onClose', async () => {
      await io.close();
    });
  },
  { name: 'socketio', dependencies: ['security'] },
);
