import type { GameStateProjected, LiveKitTokenResponse } from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const GAME_PATH = {
  active: '/api/v1/game/active',
  details: (id: string) => `/api/v1/game/${id}`,
  leave: (id: string) => `/api/v1/game/${id}/leave`,
  log: (id: string) => `/api/v1/game/${id}/log`,
  liveKitToken: (id: string) => `/api/v1/game/${id}/livekit-token`,
};

export const gameApi = {
  active: () => apiClient.get<{ gameId: string | null }>(GAME_PATH.active),
  details: (id: string) => apiClient.get<{ game: GameStateProjected }>(GAME_PATH.details(id)),
  leave: (id: string) => apiClient.post<{ ok: true }>(GAME_PATH.leave(id)),
  log: (id: string) => apiClient.get<{ lines: string[] }>(GAME_PATH.log(id)),
  liveKitToken: (id: string) => apiClient.post<LiveKitTokenResponse>(GAME_PATH.liveKitToken(id)),
};
