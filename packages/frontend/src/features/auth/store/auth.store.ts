// Auth store holds the currently authenticated user.
//
// The cookie lives in the browser (HTTP-only, set by the backend) and is the source of truth
// for whether the session is valid. This store mirrors the user object so components can
// read it synchronously instead of waiting for a request on every render.

import { create } from 'zustand';

import type { AuthenticatedUser } from '@mafia/shared';

interface AuthStore {
  user: AuthenticatedUser | null;
  isHydrated: boolean;

  setUser: (user: AuthenticatedUser | null) => void;
  markHydrated: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isHydrated: false,

  setUser: (user) => set({ user }),
  markHydrated: () => set({ isHydrated: true }),
}));
