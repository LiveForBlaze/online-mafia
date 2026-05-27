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
    // Закрывает все сокеты указанного юзера. Используется при бане/смене
    // ограничений: клиент переподключится и подхватит свежие флаги из
    // /auth/me, а если он залочен — соединение просто отвалится.
    disconnectUser(userId: string): Promise<number>;
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

    // Per-USER rate limiter (раньше был per-socket — одна вкладка ≠ один
    // лимит, две вкладки давали N×лимит). Теперь ключ = `${userId}:${event}`,
    // одни ведра шарятся между всеми сокетами одного юзера. Защищаем оба
    // пути (lobby chat + game actions) от спама/DoS.
    //
    // Реализовано как packet-middleware: при превышении пакет отбивается с
    // ошибкой в ack, но СОКЕТ ОСТАЁТСЯ ЖИВ. Раньше я делал
    // `socket.disconnect(true)`, и клиент уходил на exponential-backoff
    // реконнект (1→2→5→10s) — это ломало редирект игроков в момент старта
    // игры (хост шлёт broadcast, а у других сокет «отдыхает» 10s).
    const RATE_WINDOW_MS = 10_000;
    const RATE_LIMITS: Record<string, number> = {
      // Чат — в среднем 3/сек комфортно, спам отрубается.
      'client:lobby_chat_send': 30,
      // Игровые / lobby действия — щедрый лимит на legitimate UI bursts
      // (клик-клик-клик при назначении, переподключения, mount флёшы).
      __default__: 200,
    };
    // Shared module-scope map of buckets, keyed by `${userId}:${event}`.
    // Анонимные/незаауентифицированные сокеты (не должны сюда долетать — их
    // отрубает io.use auth выше — но defence-in-depth) валятся в socket.id.
    const buckets = new Map<string, { count: number; resetAt: number }>();
    // Лёгкая периодическая чистка: каждые 30 секунд удаляем bucket'ы, чьё
    // окно истекло и нет нового трафика — иначе Map пухнет на длинных
    // сессиях. Лимит сам по себе тоже expire-on-read, эта чистка — для
    // GC долгоживущих узлов.
    const sweepTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }, 30_000);
    io.use((socket, next) => {
      socket.use((packet, dispatch) => {
        const event = packet[0];
        if (typeof event !== 'string') return dispatch();
        const limit = RATE_LIMITS[event] ?? RATE_LIMITS.__default__ ?? 200;
        const ownerKey = socket.data.user?.sub ?? `socket:${socket.id}`;
        const bucketKey = `${ownerKey}:${event}`;
        const now = Date.now();
        const bucket = buckets.get(bucketKey);
        if (!bucket || bucket.resetAt <= now) {
          buckets.set(bucketKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
          return dispatch();
        }
        bucket.count += 1;
        if (bucket.count > limit) {
          // Не дисконнектим сокет — лишь отказываем пакету. Socket.IO
          // отдаст ошибку в ack callback клиента, а соединение продолжит
          // жить, так что broadcast'ы и server-push доходят моментально.
          return dispatch(new Error('rate_limited'));
        }
        return dispatch();
      });
      next();
    });

    app.decorate('io', io);

    // Дисконнект всех сокетов одного юзера. Возвращает число закрытых.
    // Используется админом при выставлении restrictions: на следующем коннекте
    // клиент подтянет свежий /auth/me с новыми флагами; если ему запрещён
    // конкретный socket-канал, прикладной код там сам разрулит.
    app.decorate('disconnectUser', async (userId: string) => {
      const sockets = await io.fetchSockets();
      let closed = 0;
      for (const s of sockets) {
        if (s.data.user?.sub === userId) {
          s.disconnect(true);
          closed += 1;
        }
      }
      return closed;
    });

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
      clearInterval(sweepTimer);
      await io.close();
    });
  },
  { name: 'socketio', dependencies: ['security'] },
);
