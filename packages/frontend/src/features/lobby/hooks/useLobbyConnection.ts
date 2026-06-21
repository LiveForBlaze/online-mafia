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
    // Захватываем в const, чтобы TS убрал union с undefined внутри
    // вложенных функций после early-return выше.
    const id = lobbyId;

    const socket = connectGameSocket();

    function joinRoom() {
      // После каждого reconnect/mount подтягиваем актуальное состояние
      // сразу: пока мы были отключены, кто-то мог зайти/выйти и broadcast
      // прошёл мимо. invalidate триггерит немедленный REST refetch.
      void emitGameAction<Ack>(CLIENT_EVENT.LOBBY_JOIN, { lobbyId: id });
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(id) });
    }

    function handleLobbyUpdate(payload: LobbyDetailsResponse) {
      // Пишем свежие данные сразу — это даёт мгновенный re-render через
      // useLobby. Формат payload совпадает с REST-ответом, поэтому повторный
      // invalidate (→ лишний HTTP GET тех же данных) не нужен: REST-refetch на
      // mount/reconnect делает joinRoom выше.
      queryClient.setQueryData(LOBBY_QUERY_KEY.details(id), payload);
    }

    socket.on('connect', joinRoom);
    // Socket.IO triggers `reconnect` after recovering from a network drop —
    // re-join the room and pull fresh details, в случае если push'и пришли
    // во время простоя соединения.
    socket.io.on('reconnect', joinRoom);
    socket.on(SERVER_EVENT.LOBBY_UPDATED, handleLobbyUpdate);

    if (socket.connected) joinRoom();

    return () => {
      socket.off('connect', joinRoom);
      socket.io.off('reconnect', joinRoom);
      socket.off(SERVER_EVENT.LOBBY_UPDATED, handleLobbyUpdate);
      void emitGameAction<Ack>(CLIENT_EVENT.LOBBY_LEAVE, { lobbyId: id });
    };
  }, [lobbyId, queryClient]);
}
