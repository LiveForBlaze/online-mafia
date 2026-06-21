// Mutation hooks for the auth actions (register, login, logout).
//
// Each hook returns a TanStack Query mutation handle. The mutation's `onSuccess`
// updates the shared auth store, so any component reading `useAuthStore` re-renders
// without a manual refetch.

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type {
  DeleteAccountInput,
  LoginInput,
  RegisterInput,
  UpdateNicknameInput,
  UpdateProfileInput,
} from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { disconnectGameSocket } from '@/features/game/socket/game.socket.js';

const AUTH_ERROR_KEYS = new Set([
  'invalid_credentials',
  'email_taken',
  'nickname_taken',
  'nickname_rejected',
  'avatar_locked',
  'password_not_set',
  'google_oauth_not_configured',
  'google_email_not_verified',
  'invalid_input',
  'unauthenticated',
  'network',
  'unknown',
]);

export function useRegister() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: (data) => setUser(data.user),
  });
}

export function useLogin() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (data) => setUser(data.user),
  });
}

export function useUpdateNickname() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (input: UpdateNicknameInput) => authApi.updateNickname(input),
    onSuccess: (data) => setUser(data.user),
  });
}

export function useUpdateProfile() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => authApi.updateProfile(input),
    onSuccess: (data) => setUser(data.user),
  });
}

export function useLogout() {
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    // Tear down the previous session's identity-bound resources: clear the user,
    // drop the old socket, and wipe the query cache so the next user on this same
    // tab can't read the previous user's cached private data.
    onSettled: () => {
      setUser(null);
      disconnectGameSocket();
      queryClient.clear();
    },
  });
}

// Permanently delete (anonymise) the current account. The backend wipes the
// session cookie; we mirror that here by clearing the local user. Callers
// handle the navigation away from authenticated pages on success.
export function useDeleteAccount() {
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteAccountInput) => authApi.deleteAccount(input),
    onSuccess: () => {
      setUser(null);
      disconnectGameSocket();
      queryClient.clear();
    },
  });
}

/** Hook returning a function that resolves an auth error code to a localized string. */
export function useAuthErrorMessage(): (code: string | undefined) => string {
  const { t } = useTranslation();
  return useCallback(
    (code: string | undefined): string => {
      if (code && AUTH_ERROR_KEYS.has(code)) {
        return t(`auth.errors.${code}`);
      }
      return t('auth.errors.unknown');
    },
    [t],
  );
}

/** Hook returning a function that extracts a user-friendly error message from a mutation error. */
export function useExtractAuthErrorMessage(): (error: unknown) => string {
  const authErrorMessage = useAuthErrorMessage();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        return authErrorMessage(error.body.error);
      }
      return authErrorMessage(undefined);
    },
    [authErrorMessage],
  );
}
