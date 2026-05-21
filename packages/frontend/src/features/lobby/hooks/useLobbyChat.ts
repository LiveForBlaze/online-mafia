// Subscribe to lobby chat broadcasts and provide a sender.
//
// The lobby socket is already opened by useLobbyConnection — we just hook
// into the existing connection and listen for chat messages. Local state
// is reset on lobbyId change so two different lobby rooms never leak
// messages into each other.

import { useCallback, useEffect, useState } from 'react';

import {
  CLIENT_EVENT,
  SERVER_EVENT,
  type LobbyChatBroadcast,
  type LobbyChatMessage,
} from '@mafia/shared';

import { connectGameSocket, emitGameAction } from '@/features/game/socket/game.socket.js';

interface SendAck {
  ok: boolean;
  error?: string;
}

export function useLobbyChat(lobbyId: string | undefined): {
  messages: LobbyChatMessage[];
  send: (text: string) => Promise<SendAck>;
} {
  const [messages, setMessages] = useState<LobbyChatMessage[]>([]);

  useEffect(() => {
    setMessages([]);
    if (!lobbyId) return;

    const socket = connectGameSocket();

    function handleMessage(payload: LobbyChatBroadcast) {
      if (payload.message.lobbyId !== lobbyId) return;
      setMessages((current) => {
        // Deduplicate on id — the server replays the buffer to new joiners,
        // and they might also catch a live broadcast for the same message
        // during the join window.
        if (current.some((m) => m.id === payload.message.id)) return current;
        return [...current, payload.message];
      });
    }

    socket.on(SERVER_EVENT.LOBBY_CHAT_MESSAGE, handleMessage);
    return () => {
      socket.off(SERVER_EVENT.LOBBY_CHAT_MESSAGE, handleMessage);
    };
  }, [lobbyId]);

  const send = useCallback(
    async (text: string): Promise<SendAck> => {
      if (!lobbyId) return { ok: false, error: 'no_lobby' };
      const trimmed = text.trim();
      if (trimmed.length === 0) return { ok: false, error: 'empty' };
      return emitGameAction<SendAck>(CLIENT_EVENT.LOBBY_CHAT_SEND, {
        lobbyId,
        text: trimmed,
      });
    },
    [lobbyId],
  );

  return { messages, send };
}
