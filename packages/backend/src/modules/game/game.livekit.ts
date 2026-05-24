// LiveKit access-token issuance.
//
// Each game has its own LiveKit room named `game:<gameId>` — the same name as the
// Socket.IO room, so the two transports stay aligned. A user gets a short-lived JWT
// containing the room name, their identity (userId), display name (nickname), and grants.
//
// For V0 we grant publish+subscribe to all participants. When a player is killed the
// frontend hides their video; locking down server-side permissions on death is a future
// improvement (it requires reissuing tokens or using LiveKit room admin API).

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.client.js';

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
// Короче, чем раньше: 30 минут хватает на партию + переподключение, но не
// сохраняет украденный cookie на полсуток. Клиент перевыпустит токен после
// истечения через REST.
const LIVEKIT_TOKEN_TTL_SECONDS = 30 * 60;

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

// Lazily-created room service client. Used для принудительного выкидывания
// участника из его LK-комнат при logout/delete — без этого старый LK-токен
// продолжает работать до конца TTL даже после ротации session-куки.
let roomServiceClient: RoomServiceClient | null = null;
function getRoomServiceClient(): RoomServiceClient {
  if (!roomServiceClient) {
    roomServiceClient = new RoomServiceClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );
  }
  return roomServiceClient;
}

// Принудительно убирает пользователя из всех его активных LiveKit-комнат.
// Вызывается на logout и на удалении аккаунта — закрывает окно, в котором
// украденный bearer-token LK ещё работал бы до истечения 30-минутного TTL.
export async function revokeLiveKitForUser(userId: string): Promise<void> {
  // Активные игры пользователя — в Game с endedAt=null. Для каждой попробуем
  // удалить из комнаты; best-effort, ошибки игнорируем (комнаты может уже не
  // быть, токен мог не успеть подключиться).
  const games = await prisma.game.findMany({
    where: { endedAt: null, participants: { some: { userId } } },
    select: { id: true },
  });
  if (games.length === 0) return;
  const client = getRoomServiceClient();
  await Promise.allSettled(
    games.map((g) =>
      client.removeParticipant(liveKitRoomNameForGame(g.id), userId).catch(() => {}),
    ),
  );
}
