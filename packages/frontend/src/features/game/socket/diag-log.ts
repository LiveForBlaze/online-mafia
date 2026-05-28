// Fire-and-forget diag pings from the browser to the backend `client:diag`
// handler. Used to capture audio-filter decisions, state-delta arrivals,
// and uncaught errors so they end up in the per-game debug log.
//
// The call silently no-ops when the socket isn't connected — these pings
// are diagnostic, never on the critical path of a player action.

import { CLIENT_EVENT } from '@mafia/shared';

import { getGameSocket } from './game.socket.js';

export function pushDiag(type: string, data: unknown): void {
  const socket = getGameSocket();
  if (!socket?.connected) return;
  socket.emit(CLIENT_EVENT.CLIENT_DIAG, { type, data });
}
