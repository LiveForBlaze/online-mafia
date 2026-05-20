import type { GameStateProjected, LiveKitTokenResponse } from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const GAME_PATH = {
  details: (id: string) => `/api/v1/game/${id}`,
  liveKitToken: (id: string) => `/api/v1/game/${id}/livekit-token`,
};

export const gameApi = {
  details: (id: string) => apiClient.get<{ game: GameStateProjected }>(GAME_PATH.details(id)),
  liveKitToken: (id: string) => apiClient.post<LiveKitTokenResponse>(GAME_PATH.liveKitToken(id)),
};
