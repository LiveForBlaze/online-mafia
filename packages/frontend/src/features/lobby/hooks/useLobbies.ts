// Query hook for the list of public lobbies.
// Refetches every 5 seconds so newly created lobbies appear without manual refresh.
// The interval is deliberately gentle — until we add WebSocket push, this is a fair
// trade between freshness and request volume.

import { useQuery } from '@tanstack/react-query';

import { lobbyApi } from '@/features/lobby/api/lobby.api.js';

export const LOBBY_QUERY_KEY = {
  list: () => ['lobbies'] as const,
  active: () => ['lobbies', 'active'] as const,
  details: (id: string) => ['lobby', id] as const,
} as const;

const LIST_REFETCH_INTERVAL_MS = 5_000;

export function useLobbies() {
  return useQuery({
    queryKey: LOBBY_QUERY_KEY.list(),
    queryFn: () => lobbyApi.list(),
    refetchInterval: LIST_REFETCH_INTERVAL_MS,
  });
}

export function useActiveLobbies() {
  return useQuery({
    queryKey: LOBBY_QUERY_KEY.active(),
    queryFn: () => lobbyApi.listActive(),
    refetchInterval: LIST_REFETCH_INTERVAL_MS,
  });
}
