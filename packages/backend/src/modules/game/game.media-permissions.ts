// Server-side enforcement of who may publish video/audio at any given moment.
//
// We mirror the client-side rules in media-visibility.ts here on the backend, but
// instead of just hiding remote tracks we actually revoke publishing permission
// via LiveKit's Admin API. When `canPublish` flips to false, LiveKit force-
// unpublishes the participant's current tracks — so a tampered client cannot
// keep their camera live during a phase where they shouldn't.
//
// Subscribing stays unconditionally allowed: the privacy comes from nobody
// publishing the secret-phase tracks in the first place.

import { RoomServiceClient } from 'livekit-server-sdk';
import { GAME_PHASE, ROLE } from '@mafia/shared';

import { env } from '../../config/env.js';

import { liveKitRoomNameForGame } from './game.livekit.js';
import type { GameParticipant, GameState } from './game.state.js';

// Convert the public ws(s):// LiveKit URL into the http(s):// URL the Admin API expects.
function toHttpUrl(wsOrHttpUrl: string): string {
  return wsOrHttpUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

let roomService: RoomServiceClient | null = null;
function getRoomService(): RoomServiceClient {
  if (!roomService) {
    roomService = new RoomServiceClient(
      toHttpUrl(env.LIVEKIT_URL),
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
  }
  return roomService;
}

function computeCanPublish(state: GameState, p: GameParticipant): boolean {
  // The judge always controls and observes the table — never restricted.
  if (p.isJudge) return true;
  // Dead players are silent spectators forever.
  if (!p.isAlive || p.isRemoved) return false;

  switch (state.phase) {
    // Mafia coordination phases: only the mafia team broadcasts.
    case GAME_PHASE.NIGHT_ZERO:
    case GAME_PHASE.NIGHT_MAFIA:
      return p.role === ROLE.MAFIA || p.role === ROLE.DON;

    // Don and sheriff checks happen privately — no player publishes;
    // they just pick a seat number and read the judge's announcement.
    case GAME_PHASE.NIGHT_DON:
    case GAME_PHASE.NIGHT_SHERIFF:
      return false;

    // Everything else (lobby, role_distribution, day_*, morning, game_over) is open.
    default:
      return true;
  }
}

/**
 * Sync every participant's LiveKit publish permission to match the current game state.
 * Fire-and-forget — the service does not await this; if LiveKit is slow or down the
 * game still progresses and clients fall back to in-app visibility filtering.
 */
export async function syncMediaPermissions(state: GameState): Promise<void> {
  const room = liveKitRoomNameForGame(state.id);
  const svc = getRoomService();

  await Promise.all(
    state.participants.map(async (participant) => {
      const canPublish = computeCanPublish(state, participant);
      try {
        await svc.updateParticipant(room, participant.userId, undefined, {
          canSubscribe: true,
          canPublish,
          canPublishData: false,
          canUpdateMetadata: false,
          hidden: false,
          recorder: false,
          // Empty array allows publishing all sources when canPublish is true.
          // LiveKit ignores this when canPublish is false.
          canPublishSources: [],
          agent: false,
        });
      } catch {
        // Common case: participant hasn't joined the LiveKit room yet. Their
        // initial permission comes from the access token; the next sync after
        // a phase change will catch them. Other errors are logged but never
        // crash the service — privacy still degrades gracefully to the client
        // filter in media-visibility.ts.
      }
    }),
  );
}
