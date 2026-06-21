// Wrapper that redirects unauthenticated users to the login page.
// While the auth store is still hydrating (initial /me request in flight),
// it shows a full-page loader instead of a blank viewport — preventing a
// flash of empty page (or login screen) on every refresh.

import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { FullPageLoader } from '@/components/ui/FullPageLoader.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from './paths.js';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated) {
    return <FullPageLoader />;
  }

  if (!user) {
    return <Navigate to={ROUTE_PATH.LOGIN} replace />;
  }

  return <>{children}</>;
}
