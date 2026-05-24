// Holds the current projected game state. Updated whenever the server emits a state delta.
// Components subscribe via useGameStore selectors so they only re-render when their slice changes.

import { create } from 'zustand';

import type { GameStateProjected } from '@mafia/shared';

interface GameStore {
  state: GameStateProjected | null;
  isConnected: boolean;
  lastError: string | null;
  // Судейский режим прослушивания. false (default): «слышать игровой процесс»
  // — только current speaker, out-of-turn, farewell/last word, как у живых
  // игроков. true: «слышать всё» — overhear-режим для модерации (например,
  // когда нужно проверить, что мафия не говорит вслух ночью). По жалобе
  // пользователя: ведущий «слышит всё», и это сбивает с толку — а также
  // вызывает петлю эха, когда чужой голос идёт через колонки судьи.
  judgeOverhearAll: boolean;

  setState: (state: GameStateProjected) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setJudgeOverhearAll: (v: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  isConnected: false,
  lastError: null,
  judgeOverhearAll: false,

  setState: (state) => set({ state }),
  setConnected: (isConnected) => set({ isConnected }),
  setError: (lastError) => set({ lastError }),
  setJudgeOverhearAll: (judgeOverhearAll) => set({ judgeOverhearAll }),
  reset: () => set({ state: null, isConnected: false, lastError: null, judgeOverhearAll: false }),
}));
