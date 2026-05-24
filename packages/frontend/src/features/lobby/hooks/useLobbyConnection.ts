// Realtime connection for the lobby room page.
//
// Opens / reuses the shared Socket.IO connection, joins the lobby room, and
// writes incoming state updates directly into the React Query cache so the
// rest of the lobby UI (which reads via useLobby) refreshes automatically.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { CLIENT_EVENT, SERVER_EVENT, type LobbyDetailsResponse } from '@mafia/shared';

import { connectGameSocket, emitGameAction } from '@/features/game/socket/game.socket.js';

import { LOBBY_QUERY_KEY } from './useLobbies.js';

interface Ack {
  ok: boolean;
  error?: string;
}

export function useLobbyConnection(lobbyId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!lobbyId) return;

    const socket = connectGameSocket();

    function joinRoom() {
      void emitGameAction<Ack>(CLIENT_EVENT.LOBBY_JOIN, { lobbyId });
    }

    function handleLobbyUpdate(payload: LobbyDetailsResponse) {
      // Пишем свежие данные сразу — это даёт мгновенный re-render через
      // useLobby. Дополнительно вызываем invalidate как страховку: если
      // payload пришёл в неожиданном формате (старый клиент / новый сервер),
      // react-query сам перетянет актуальный snapshot через REST.
      queryClient.setQueryData(LOBBY_QUERY_KEY.details(lobbyId!), payload);
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(lobbyId!) });
    }

    socket.on('connect', joinRoom);
    socket.on(SERVER_EVENT.LOBBY_UPDATED, handleLobbyUpdate);

    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', joinRoom);
      socket.off(SERVER_EVENT.LOBBY_UPDATED, handleLobbyUpdate);
      void emitGameAction<Ack>(CLIENT_EVENT.LOBBY_LEAVE, { lobbyId });
    };
  }, [lobbyId, queryClient]);
}
