// Query hook for a single lobby's details.
// Polls every 2 seconds while the page is open — the lobby room is dynamic
// (members joining and leaving) and 2s feels close to "real time" without overload.
// This will be replaced by WebSocket push events once the game module lands.

import { useQuery } from '@tanstack/react-query';

import { lobbyApi } from '@/features/lobby/api/lobby.api.js';
import { LOBBY_QUERY_KEY } from './useLobbies.js';

// With realtime push via Socket.IO covering updates, the polling acts only as a
// safety fallback in case a push is missed (e.g. due to a transient disconnect).
const ROOM_REFETCH_INTERVAL_MS = 30_000;

export function useLobby(lobbyId: string | undefined) {
  return useQuery({
    queryKey: lobbyId ? LOBBY_QUERY_KEY.details(lobbyId) : ['lobby', 'none'],
    queryFn: () => {
      if (!lobbyId) throw new Error('Missing lobby id');
      return lobbyApi.details(lobbyId);
    },
    enabled: Boolean(lobbyId),
    refetchInterval: ROOM_REFETCH_INTERVAL_MS,
  });
}
