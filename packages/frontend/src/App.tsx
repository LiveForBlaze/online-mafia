// Top-level component. Wires up routes and hydrates the current user from /me on mount.
//
// Each route's protection (login required vs public) is declared via the AuthGuard wrapper.
// Authenticated "shell" routes (lobby list, profile, clubs, tournaments, rules,
// about, lobby room) render inside MainLayout so they share the top nav.
// Auth pages and the full-screen game page render outside the layout.

import { Navigate, Route, Routes } from 'react-router';

import { MainLayout } from '@/components/layout/MainLayout.js';
import { useHydrateCurrentUser } from '@/features/auth/hooks/useCurrentUser.js';
import { LoginPage } from '@/features/auth/pages/LoginPage.js';
import { RegisterPage } from '@/features/auth/pages/RegisterPage.js';
import { LobbyListPage } from '@/features/lobby/pages/LobbyListPage.js';
import { LobbyRoomPage } from '@/features/lobby/pages/LobbyRoomPage.js';
import { GamePage } from '@/features/game/pages/GamePage.js';
import { UserPage } from '@/features/users/pages/UserPage.js';
import { AboutPage } from '@/pages/AboutPage.js';
import { ClubsPage } from '@/pages/ClubsPage.js';
import { RulesPage } from '@/pages/RulesPage.js';
import { TournamentsPage } from '@/pages/TournamentsPage.js';
import { AuthGuard } from '@/routes/AuthGuard.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function App() {
  useHydrateCurrentUser();

  return (
    <Routes>
      <Route path={ROUTE_PATH.LOGIN} element={<LoginPage />} />
      <Route path={ROUTE_PATH.REGISTER} element={<RegisterPage />} />

      {/* Authenticated shell — top nav + page content. */}
      <Route
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      >
        <Route path={ROUTE_PATH.HOME} element={<LobbyListPage />} />
        <Route path={ROUTE_PATH.USER} element={<UserPage />} />
        <Route path={ROUTE_PATH.CLUBS} element={<ClubsPage />} />
        <Route path={ROUTE_PATH.TOURNAMENTS} element={<TournamentsPage />} />
        <Route path={ROUTE_PATH.RULES} element={<RulesPage />} />
        <Route path={ROUTE_PATH.ABOUT} element={<AboutPage />} />
        <Route path={ROUTE_PATH.LOBBY_ROOM} element={<LobbyRoomPage />} />
      </Route>

      {/* Full-screen game page — no top nav. */}
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
