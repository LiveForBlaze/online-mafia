// Top-level component. Wires up routes and hydrates the current user from /me on mount.
//
// Each route's protection (login required vs public) is declared via the AuthGuard wrapper.
// Provider setup (React Query, Router) lives in main.tsx, intentionally separate from routing.

import { Navigate, Route, Routes } from 'react-router';

import { useHydrateCurrentUser } from '@/features/auth/hooks/useCurrentUser.js';
import { LoginPage } from '@/features/auth/pages/LoginPage.js';
import { RegisterPage } from '@/features/auth/pages/RegisterPage.js';
import { LobbyListPage } from '@/features/lobby/pages/LobbyListPage.js';
import { LobbyRoomPage } from '@/features/lobby/pages/LobbyRoomPage.js';
import { GamePage } from '@/features/game/pages/GamePage.js';
import { AuthGuard } from '@/routes/AuthGuard.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function App() {
  useHydrateCurrentUser();

  return (
    <Routes>
      <Route path={ROUTE_PATH.LOGIN} element={<LoginPage />} />
      <Route path={ROUTE_PATH.REGISTER} element={<RegisterPage />} />
      <Route
        path={ROUTE_PATH.HOME}
        element={
          <AuthGuard>
            <LobbyListPage />
          </AuthGuard>
        }
      />
      <Route
        path={ROUTE_PATH.LOBBY_ROOM}
        element={
          <AuthGuard>
            <LobbyRoomPage />
          </AuthGuard>
        }
      />
      <Route
        path={ROUTE_PATH.GAME_ROOM}
        element={
          <AuthGuard>
            <GamePage />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to={ROUTE_PATH.HOME} replace />} />
    </Routes>
  );
}
