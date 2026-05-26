// Lobby API client. Each function maps to one backend endpoint and is fully typed
// via the shared zod schemas exported from @mafia/shared.

import type {
  CreateLobbyInput,
  HomeStats,
  JoinLobbyInput,
  LobbyDetailsResponse,
  LobbyListResponse,
  PreassignRoleInput,
} from '@mafia/shared';

import { apiClient } from '@/lib/api-client.js';

const LOBBY_BASE = '/api/v1/lobby';

const path = {
  list: () => LOBBY_BASE,
  listActive: () => `${LOBBY_BASE}/active`,
  stats: () => `${LOBBY_BASE}/stats`,
  create: () => LOBBY_BASE,
  details: (id: string) => `${LOBBY_BASE}/${id}`,
  join: (id: string) => `${LOBBY_BASE}/${id}/join`,
  claimJudge: (id: string) => `${LOBBY_BASE}/${id}/claim-judge`,
  leave: (id: string) => `${LOBBY_BASE}/${id}/leave`,
  close: (id: string) => `${LOBBY_BASE}/${id}`,
  kick: (id: string) => `${LOBBY_BASE}/${id}/kick`,
  preassignRole: (id: string) => `${LOBBY_BASE}/${id}/preassign-role`,
  start: (id: string) => `${LOBBY_BASE}/${id}/start`,
  fillBots: (id: string) => `${LOBBY_BASE}/${id}/fill-bots`,
  ready: (id: string) => `${LOBBY_BASE}/${id}/ready`,
} as const;

export const lobbyApi = {
  list: () => apiClient.get<LobbyListResponse>(path.list()),
  listActive: () => apiClient.get<LobbyListResponse>(path.listActive()),
  stats: () => apiClient.get<HomeStats>(path.stats()),
  create: (input: CreateLobbyInput) => apiClient.post<LobbyDetailsResponse>(path.create(), input),
  details: (id: string) => apiClient.get<LobbyDetailsResponse>(path.details(id)),
  join: (id: string, input: JoinLobbyInput) =>
    apiClient.post<LobbyDetailsResponse>(path.join(id), input),
  claimJudge: (id: string) => apiClient.post<LobbyDetailsResponse>(path.claimJudge(id)),
  leave: (id: string) => apiClient.post<{ closed: boolean }>(path.leave(id)),
  close: (id: string) => apiClient.delete<{ closed: true }>(path.close(id)),
  kick: (id: string, userId: string) =>
    apiClient.post<LobbyDetailsResponse>(path.kick(id), { userId }),
  preassignRole: (id: string, input: PreassignRoleInput) =>
    apiClient.post<LobbyDetailsResponse>(path.preassignRole(id), input),
  start: (id: string) => apiClient.post<{ gameId: string }>(path.start(id)),
  fillBots: (id: string) => apiClient.post<{ added: number }>(path.fillBots(id)),
  setReady: (id: string, ready: boolean) =>
    apiClient.post<LobbyDetailsResponse>(path.ready(id), { ready }),
};
