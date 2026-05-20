// LiveKit access-token issuance.
//
// Each game has its own LiveKit room named `game:<gameId>` — the same name as the
// Socket.IO room, so the two transports stay aligned. A user gets a short-lived JWT
// containing the room name, their identity (userId), display name (nickname), and grants.
//
// For V0 we grant publish+subscribe to all participants. When a player is killed the
// frontend hides their video; locking down server-side permissions on death is a future
// improvement (it requires reissuing tokens or using LiveKit room admin API).

import { AccessToken } from 'livekit-server-sdk';

import { env } from '../../config/env.js';

import { getGame } from './game.registry.js';
import { findByUserId, type GameParticipant } from './game.state.js';
import { GAME_ERROR, type GameErrorCode } from './game.errors.js';

interface IssueTokenSuccess {
  ok: true;
  token: string;
  url: string;
  roomName: string;
}
interface IssueTokenFailure {
  ok: false;
  error: GameErrorCode;
}
export type IssueTokenResult = IssueTokenSuccess | IssueTokenFailure;

const LIVEKIT_ROOM_PREFIX = 'game:';
// Tokens live longer than a single game so reconnects work without re-fetching;
// 12 hours is comfortably more than even a long tournament round.
const LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60 * 12;

export function liveKitRoomNameForGame(gameId: string): string {
  return `${LIVEKIT_ROOM_PREFIX}${gameId}`;
}

export async function issueLiveKitTokenForGame(
  gameId: string,
  userId: string,
): Promise<IssueTokenResult> {
  const state = getGame(gameId);
  if (!state) return { ok: false, error: GAME_ERROR.GAME_NOT_FOUND };

  const participant = findByUserId(state, userId);
  if (!participant) return { ok: false, error: GAME_ERROR.NOT_PARTICIPANT };

  const token = await createAccessToken(gameId, participant);
  return {
    ok: true,
    token,
    url: env.LIVEKIT_URL,
    roomName: liveKitRoomNameForGame(gameId),
  };
}

async function createAccessToken(gameId: string, participant: GameParticipant): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: participant.userId,
    name: participant.nickname,
    ttl: LIVEKIT_TOKEN_TTL_SECONDS,
  });
  at.addGrant({
    room: liveKitRoomNameForGame(gameId),
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  return at.toJwt();
}
