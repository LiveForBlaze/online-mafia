// In-memory chat store for the lobby waiting room.
//
// Lobby chat is a pre-game social niceness — players say hi and figure out
// who's bringing the chips. We deliberately do NOT persist messages to the
// database:
//   - Lobbies are short-lived (gathering phase only); once the game starts
//     in-game audio replaces the chat
//   - No history needed for late joiners — chat starts fresh when they arrive
//   - Saves a DB write per message, keeps the lobby flow fast
//
// Each lobby gets a small ring buffer (LOBBY_CHAT_BUFFER_SIZE messages).
// New joiners receive the buffer on subscribe so they have some context
// without bloating storage. The buffer evicts on lobby close.

import { randomUUID } from 'node:crypto';

import { LOBBY_CHAT_MAX_LENGTH, type LobbyChatMessage } from '@mafia/shared';

/** Keep the last ~100 messages per lobby. Anything older drops. */
const LOBBY_CHAT_BUFFER_SIZE = 100;

const buffers = new Map<string, LobbyChatMessage[]>();

export function appendLobbyChatMessage(
  lobbyId: string,
  author: {
    userId: string;
    nickname: string;
    publicCode?: string;
  },
  text: string,
): LobbyChatMessage {
  const trimmed = text.trim().slice(0, LOBBY_CHAT_MAX_LENGTH);
  const message: LobbyChatMessage = {
    id: randomUUID(),
    lobbyId,
    fromUserId: author.userId,
    fromNickname: author.nickname,
    fromPublicCode: author.publicCode,
    text: trimmed,
    sentAt: new Date().toISOString(),
  };
  const existing = buffers.get(lobbyId) ?? [];
  // Build a new array (never mutate the stored reference — callers may hold it).
  const next =
    existing.length >= LOBBY_CHAT_BUFFER_SIZE
      ? [...existing.slice(-(LOBBY_CHAT_BUFFER_SIZE - 1)), message]
      : [...existing, message];
  buffers.set(lobbyId, next);
  return message;
}

export function getLobbyChatHistory(lobbyId: string): LobbyChatMessage[] {
  return buffers.get(lobbyId) ?? [];
}

export function clearLobbyChat(lobbyId: string): void {
  buffers.delete(lobbyId);
}
