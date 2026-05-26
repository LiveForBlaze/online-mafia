// React-query хук для статистики лендинга: «N открытых · M ждут · K за столом».
//
// staleTime 30s — лендинг видят в основном на старте сессии, опаздывание на
// полминуты допустимо. refetchOnWindowFocus оставляем включённым (дефолт) —
// игрок возвращается во вкладку и видит свежие числа.

import { useQuery } from '@tanstack/react-query';

import { lobbyApi } from '@/features/lobby/api/lobby.api.js';

const STALE_MS = 30_000;

export function useHomeStats() {
  return useQuery({
    queryKey: ['lobby', 'stats'],
    queryFn: () => lobbyApi.stats(),
    staleTime: STALE_MS,
  });
}
