// Lobby API client. Each function maps to one backend endpoint and is fully typed
// via the shared zod schemas exported from @mafia/shared.

import type {
  CreateLobbyInput,
  JoinLobbyInput,
  LobbyDetailsResponse,
  LobbyListResponse,
} from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const LOBBY_BASE = '/api/v1/lobby';

const path = {
  list: () => LOBBY_BASE,
  listActive: () => `${LOBBY_BASE}/active`,
  create: () => LOBBY_BASE,
  details: (id: string) => `${LOBBY_BASE}/${id}`,
  join: (id: string) => `${LOBBY_BASE}/${id}/join`,
  leave: (id: string) => `${LOBBY_BASE}/${id}/leave`,
  close: (id: string) => `${LOBBY_BASE}/${id}`,
  kick: (id: string) => `${LOBBY_BASE}/${id}/kick`,
  start: (id: string) => `${LOBBY_BASE}/${id}/start`,
  fillBots: (id: string) => `${LOBBY_BASE}/${id}/fill-bots`,
} as const;

export const lobbyApi = {
  list: () => apiClient.get<LobbyListResponse>(path.list()),
  listActive: () => apiClient.get<LobbyListResponse>(path.listActive()),
  create: (input: CreateLobbyInput) => apiClient.post<LobbyDetailsResponse>(path.create(), input),
  details: (id: string) => apiClient.get<LobbyDetailsResponse>(path.details(id)),
  join: (id: string, input: JoinLobbyInput) =>
    apiClient.post<LobbyDetailsResponse>(path.join(id), input),
  leave: (id: string) => apiClient.post<{ closed: boolean }>(path.leave(id)),
  close: (id: string) => apiClient.delete<{ closed: true }>(path.close(id)),
  kick: (id: string, userId: string) =>
    apiClient.post<LobbyDetailsResponse>(path.kick(id), { userId }),
  start: (id: string) => apiClient.post<{ gameId: string }>(path.start(id)),
  fillBots: (id: string) => apiClient.post<{ added: number }>(path.fillBots(id)),
};
