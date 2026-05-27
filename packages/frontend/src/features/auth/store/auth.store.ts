// Auth store holds the currently authenticated user.
//
// The cookie lives in the browser (HTTP-only, set by the backend) and is the source of truth
// for whether the session is valid. This store mirrors the user object so components can
// read it synchronously instead of waiting for a request on every render.

import { create } from 'zustand';

import type { AuthenticatedUser } from '@mafia/shared';

interface AuthStore {
  user: AuthenticatedUser | null;
  // Когда бэкенд возвращает 403 banned_site_access на /auth/me — у нас НЕТ
  // user-объекта, но мы знаем что юзер залогинен и забанен. Прячем приложение
  // за BannedScreen вместо редиректа на login.
  banned: { reason: string | null } | null;
  isHydrated: boolean;

  setUser: (user: AuthenticatedUser | null) => void;
  setBanned: (banned: { reason: string | null } | null) => void;
  markHydrated: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  banned: null,
  isHydrated: false,

  setUser: (user) => set({ user, banned: null }),
  setBanned: (banned) => set({ banned, user: null }),
  markHydrated: () => set({ isHydrated: true }),
}));
