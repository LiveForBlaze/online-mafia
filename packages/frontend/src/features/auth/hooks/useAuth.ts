// Mutation hooks for the auth actions (register, login, logout).
//
// Each hook returns a TanStack Query mutation handle. The mutation's `onSuccess`
// updates the shared auth store, so any component reading `useAuthStore` re-renders
// without a manual refetch.

import { useMutation } from '@tanstack/react-query';

import type { LoginInput, RegisterInput } from '@mafia/shared';

import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { authErrorMessage } from '@/features/auth/messages.js';

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

export function useLogout() {
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => setUser(null),
  });
}

/** Extract a user-friendly error message from a mutation error. */
export function extractAuthErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return authErrorMessage(error.body.error);
  }
  return authErrorMessage(undefined);
}
