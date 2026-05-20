// Look up the current user's in-progress game (if any). Used by the home page
// to auto-redirect a returning player back into their game after a connection
// drop, page refresh, or accidental navigation away.

import { useQuery } from '@tanstack/react-query';

import { gameApi } from '@/features/game/api/game.api.js';

// Poll periodically so a player who lands on /, waits a moment, and then has
// a new game start (e.g. host pressed "Start" while they were on the home page)
// still gets pulled in without a manual refresh.
const ACTIVE_GAME_REFETCH_INTERVAL_MS = 5_000;

export function useActiveGame() {
  return useQuery({
    queryKey: ['game', 'active'],
    queryFn: () => gameApi.active(),
    refetchInterval: ACTIVE_GAME_REFETCH_INTERVAL_MS,
  });
}
