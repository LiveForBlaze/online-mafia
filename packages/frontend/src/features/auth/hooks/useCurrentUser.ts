// Hook that resolves the current user once at app start, then keeps the store in sync.
// Components read from the store directly (useAuthStore) — they should not call this hook
// themselves; it is mounted at the app root.

import { useEffect } from 'react';

import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';

export function useHydrateCurrentUser(): void {
  const setUser = useAuthStore((state) => state.setUser);
  const markHydrated = useAuthStore((state) => state.markHydrated);

  useEffect(() => {
    const controller = new AbortController();

    authApi
      .getCurrentUser()
      .then((response) => {
        setUser(response.user);
      })
      .catch((error: unknown) => {
        // 401 is the expected outcome when the user is not logged in — clear, do not log.
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to load current user', error);
        setUser(null);
      })
      .finally(() => {
        markHydrated();
      });

    return () => controller.abort();
  }, [setUser, markHydrated]);
}
