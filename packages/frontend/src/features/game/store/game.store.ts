// Holds the current projected game state. Updated whenever the server emits a state delta.
// Components subscribe via useGameStore selectors so they only re-render when their slice changes.

import { create } from 'zustand';

import type { GameStateProjected } from '@mafia/shared';

interface GameStore {
  state: GameStateProjected | null;
  isConnected: boolean;
  lastError: string | null;

  setState: (state: GameStateProjected) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  isConnected: false,
  lastError: null,

  setState: (state) => set({ state }),
  setConnected: (isConnected) => set({ isConnected }),
  setError: (lastError) => set({ lastError }),
  reset: () => set({ state: null, isConnected: false, lastError: null }),
}));
