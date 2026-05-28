// Single Socket.IO connection per game-page lifetime.
//
// Kept as a module-level singleton so any component in the game subtree can emit actions
// without prop-drilling. The GamePage owns the lifecycle: connectGameSocket on mount,
// disconnectGameSocket on unmount.

import { io, type Socket } from 'socket.io-client';

import { env } from '@/lib/env.js';

let socket: Socket | null = null;

export function connectGameSocket(): Socket {
  // Reuse the singleton even when it's still mid-handshake. Previously this
  // guard required `socket.connected === true`, so if a second caller
  // (useLobbyChat after useLobbyConnection in the same render) ran while
  // socket A was still connecting, the helper would create socket B,
  // replace the module-level variable, and leak A. useLobbyConnection's
  // listeners stayed attached to A — and Socket.IO subsequently delivered
  // LOBBY_UPDATED frames to A, the orphaned socket with no React listeners,
  // so the lobby page never noticed the game had started. Reusing the
  // existing socket object regardless of `connected` keeps every caller on
  // the same instance and the same listener set.
  if (socket) return socket;
  socket = io(env.VITE_BACKEND_URL, {
    withCredentials: true,
    autoConnect: true,
    // Reuse the cookie set by the auth endpoints — no auth token in handshake.
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectGameSocket(): void {
  socket?.disconnect();
  socket = null;
}

const EMIT_TIMEOUT_MS = 10_000;

/** Emit an action and resolve when the server acknowledges.
 *  Rejects with 'ack_timeout' if the server does not respond within 10 s. */
export function emitGameAction<TResponse = unknown>(
  eventName: string,
  payload?: unknown,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not connected'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('ack_timeout')), EMIT_TIMEOUT_MS);
    socket.emit(eventName, payload ?? {}, (response: TResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export function getGameSocket(): Socket | null {
  return socket;
}
