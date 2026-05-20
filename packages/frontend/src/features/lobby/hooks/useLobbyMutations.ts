// Mutation hooks for lobby actions. Each invalidates the relevant TanStack Query keys
// so the UI refreshes automatically after a successful action.

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateLobbyInput, JoinLobbyInput } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { lobbyApi } from '@/features/lobby/api/lobby.api.js';
import { lobbyErrorMessage } from '@/features/lobby/messages.js';

import { LOBBY_QUERY_KEY } from './useLobbies.js';

export function useCreateLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLobbyInput) => lobbyApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.list() });
    },
  });
}

export function useJoinLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lobbyId, input }: { lobbyId: string; input: JoinLobbyInput }) =>
      lobbyApi.join(lobbyId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(variables.lobbyId) });
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.list() });
    },
  });
}

export function useLeaveLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lobbyId: string) => lobbyApi.leave(lobbyId),
    onSuccess: (_data, lobbyId) => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(lobbyId) });
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.list() });
    },
  });
}

export function useCloseLobby() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lobbyId: string) => lobbyApi.close(lobbyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.list() });
    },
  });
}

export function useKickMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lobbyId, userId }: { lobbyId: string; userId: string }) =>
      lobbyApi.kick(lobbyId, userId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(variables.lobbyId) });
    },
  });
}

export function useStartGame() {
  return useMutation({
    mutationFn: (lobbyId: string) => lobbyApi.start(lobbyId),
  });
}

export function useFillBots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lobbyId: string) => lobbyApi.fillBots(lobbyId),
    onSuccess: (_data, lobbyId) => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(lobbyId) });
    },
  });
}

/** Extract a localized message from a lobby mutation error. */
export function extractLobbyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return lobbyErrorMessage(error.body.error);
  }
  return lobbyErrorMessage(undefined);
}
