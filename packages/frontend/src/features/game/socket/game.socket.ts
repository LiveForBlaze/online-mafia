// Single Socket.IO connection per game-page lifetime.
//
// Kept as a module-level singleton so any component in the game subtree can emit actions
// without prop-drilling. The GamePage owns the lifecycle: connectGameSocket on mount,
// disconnectGameSocket on unmount.

import { io, type Socket } from 'socket.io-client';

import { env } from '@/lib/env.js';

let socket: Socket | null = null;

export function connectGameSocket(): Socket {
  if (socket && socket.connected) return socket;
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

/** Emit an action and resolve when the server acknowledges. */
export function emitGameAction<TResponse = unknown>(
  eventName: string,
  payload?: unknown,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Socket not connected'));
      return;
    }
    socket.emit(eventName, payload ?? {}, (response: TResponse) => resolve(response));
  });
}

export function getGameSocket(): Socket | null {
  return socket;
}
