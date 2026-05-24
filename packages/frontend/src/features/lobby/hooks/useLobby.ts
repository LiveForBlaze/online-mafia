// Query hook for a single lobby's details.
// Polls every 2 seconds while the page is open — the lobby room is dynamic
// (members joining and leaving) and 2s feels close to "real time" without overload.
// This will be replaced by WebSocket push events once the game module lands.

import { useQuery } from '@tanstack/react-query';

import { lobbyApi } from '@/features/lobby/api/lobby.api.js';
import { LOBBY_QUERY_KEY } from './useLobbies.js';

// Лобби — pure WebSocket push. Polling по таймеру убран: useLobbyConnection
// подписан на LOBBY_UPDATED и инвалидирует кэш при каждом reconnect/mount,
// что покрывает оба сценария (transient disconnect, late mount). Сохраняем
// refetchOnMount/Focus как страховочные триггеры — никаких опросных циклов.
export function useLobby(lobbyId: string | undefined) {
  return useQuery({
    queryKey: lobbyId ? LOBBY_QUERY_KEY.details(lobbyId) : ['lobby', 'none'],
    queryFn: () => {
      if (!lobbyId) throw new Error('Missing lobby id');
      return lobbyApi.details(lobbyId);
    },
    enabled: Boolean(lobbyId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
