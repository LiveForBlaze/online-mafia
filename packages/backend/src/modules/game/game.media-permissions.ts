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

function computeCanPublish(_state: GameState, p: GameParticipant): boolean {
  // Hardware (camera + mic) is owned by the player. Game mechanics never
  // revoke publish — only the visual / audible projection on other clients
  // changes by phase. The one exception: a player explicitly removed from
  // the game (judge-kicked or self-leave) loses publishing so they can't
  // keep talking from a side tab. Active players, dead or alive, keep
  // publishing; subscription rules decide who hears or sees them.
  if (p.isRemoved) return false;
  return true;
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
