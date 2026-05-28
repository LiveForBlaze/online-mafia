// Query hook for the list of public lobbies.
// Refetches every 5 seconds so newly created lobbies appear without manual refresh.
// The interval is deliberately gentle — until we add WebSocket push, this is a fair
// trade between freshness and request volume.

import { useQuery } from '@tanstack/react-query';

import { lobbyApi } from '@/features/lobby/api/lobby.api.js';

export const LOBBY_QUERY_KEY = {
  list: () => ['lobbies'] as const,
  active: () => ['lobbies', 'active'] as const,
  live: () => ['lobbies', 'live'] as const,
  details: (id: string) => ['lobby', id] as const,
} as const;

const LIST_REFETCH_INTERVAL_MS = 5_000;

// Refresh aggressively on every entry — without this, users coming back
// from a lobby (after leave / kick / game end) could land on a stale empty
// snapshot until the 5s polling tick fires. `refetchOnMount: 'always'`
// guarantees the home page is fresh the moment it renders, and
// `refetchOnWindowFocus` covers users who tab away and back.
const ALWAYS_FRESH = {
  refetchInterval: LIST_REFETCH_INTERVAL_MS,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: true,
  staleTime: 0,
};

export function useLobbies() {
  return useQuery({
    queryKey: LOBBY_QUERY_KEY.list(),
    queryFn: () => lobbyApi.list(),
    ...ALWAYS_FRESH,
  });
}

export function useActiveLobbies() {
  return useQuery({
    queryKey: LOBBY_QUERY_KEY.active(),
    queryFn: () => lobbyApi.listActive(),
    ...ALWAYS_FRESH,
  });
}

// All in-progress public games for the home page «Идут сейчас» section.
// Independent of useActiveLobbies (which is viewer-scoped — own active games).
export function useLiveLobbies() {
  return useQuery({
    queryKey: LOBBY_QUERY_KEY.live(),
    queryFn: () => lobbyApi.listLive(),
    ...ALWAYS_FRESH,
  });
}
