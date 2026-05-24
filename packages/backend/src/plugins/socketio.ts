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

    // Per-socket rate limiter. Защищаем оба пути (lobby chat + game actions) от
    // спама/DoS: один сокет не может выдать больше, чем разрешено в окне.
    // Без этого можно было слать 10к msg/sec и забивать DB + бродкаст всем
    // в комнате. Лимит свой по событиям: чат строже, остальные действия мягче.
    const RATE_WINDOW_MS = 10_000;
    const RATE_LIMITS: Record<string, number> = {
      'client:lobby_chat_send': 10, // 1/сек в среднем — комфортно для общения, отсекает спам
      'client:lobby_join': 20,
      'client:lobby_leave': 20,
      // Игровые действия — оставляем большой запас для legitimate UI bursts,
      // но не безлимит. По 50 событий в 10 секунд (5/сек) с головой хватает.
      __default__: 50,
    };
    io.use((socket, next) => {
      const buckets = new Map<string, { count: number; resetAt: number }>();
      socket.onAny((event) => {
        const limit = RATE_LIMITS[event] ?? RATE_LIMITS.__default__ ?? 50;
        const now = Date.now();
        const bucket = buckets.get(event);
        if (!bucket || bucket.resetAt <= now) {
          buckets.set(event, { count: 1, resetAt: now + RATE_WINDOW_MS });
          return;
        }
        bucket.count += 1;
        if (bucket.count > limit) {
          // Тихо отрубаем сокет — клиент переподключится с чистым бакетом.
          socket.disconnect(true);
        }
      });
      next();
    });

    app.decorate('io', io);

    // Periodically re-check tokenVersion for all connected sockets so that a
    // logout or account deletion takes effect within this window even for
    // already-connected game sockets (which are not re-authenticated per-event).
    const RECHECK_INTERVAL_MS = 5 * 60 * 1000;
    const recheckTimer = setInterval(async () => {
      const sockets = await io.fetchSockets();
      await Promise.allSettled(
        sockets.map(async (s) => {
          const user = s.data.user;
          if (!user) return;
          const dbUser = await prisma.user.findUnique({
            where: { id: user.sub },
            select: { tokenVersion: true },
          });
          if (!dbUser || dbUser.tokenVersion !== user.v) {
            s.disconnect(true);
          }
        }),
      );
    }, RECHECK_INTERVAL_MS);

    app.addHook('onClose', async () => {
      clearInterval(recheckTimer);
      await io.close();
    });
  },
  { name: 'socketio', dependencies: ['security'] },
);
