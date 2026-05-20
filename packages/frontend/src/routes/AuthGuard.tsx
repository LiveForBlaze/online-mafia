// Wrapper that redirects unauthenticated users to the login page.
// While the auth store is still hydrating (initial /me request in flight),
// it renders nothing — preventing a flash of login screen on every refresh.

import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from './paths.js';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated) {
    return null;
  }

  if (!user) {
    return <Navigate to={ROUTE_PATH.LOGIN} replace />;
  }

  return <>{children}</>;
}
