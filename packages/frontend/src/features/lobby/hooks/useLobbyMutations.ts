// Mutation hooks for lobby actions. Each invalidates the relevant TanStack Query keys
// so the UI refreshes automatically after a successful action.

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { CreateLobbyInput, JoinLobbyInput, PreassignRoleInput } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { lobbyApi } from '@/features/lobby/api/lobby.api.js';

import { LOBBY_QUERY_KEY } from './useLobbies.js';

const LOBBY_ERROR_KEYS = new Set([
  'lobby_not_found',
  'lobby_not_open',
  'lobby_full',
  'judge_slot_taken',
  'already_member',
  'not_member',
  'not_host',
  'password_required',
  'wrong_password',
  'target_not_found',
  'cannot_kick_host',
  'seat_contention',
  'role_cap_reached',
  'lobby_name_rejected',
  'invalid_input',
  'unauthenticated',
  'unknown',
]);

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

export function usePreassignRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lobbyId, input }: { lobbyId: string; input: PreassignRoleInput }) =>
      lobbyApi.preassignRole(lobbyId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: LOBBY_QUERY_KEY.details(variables.lobbyId) });
    },
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

export function useSetReady() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lobbyId, ready }: { lobbyId: string; ready: boolean }) =>
      lobbyApi.setReady(lobbyId, ready),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(LOBBY_QUERY_KEY.details(variables.lobbyId), data);
    },
  });
}

/** Hook returning a function that resolves a lobby error code to a localized string. */
export function useLobbyErrorMessage(): (code: string | undefined) => string {
  const { t } = useTranslation();
  return useCallback(
    (code: string | undefined): string => {
      if (code && LOBBY_ERROR_KEYS.has(code)) {
        return t(`lobby.errors.${code}`);
      }
      return t('lobby.errors.unknown');
    },
    [t],
  );
}

/** Hook returning a function that extracts a localized message from a lobby mutation error. */
export function useExtractLobbyErrorMessage(): (error: unknown) => string {
  const lobbyErrorMessage = useLobbyErrorMessage();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        return lobbyErrorMessage(error.body.error);
      }
      return lobbyErrorMessage(undefined);
    },
    [lobbyErrorMessage],
  );
}
