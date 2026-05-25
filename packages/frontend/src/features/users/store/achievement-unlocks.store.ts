// Очередь unlock-уведомлений «вы открыли N достижений».
//
// События приходят с бэкенда по Socket.IO (SERVER_EVENT.ACHIEVEMENTS_UNLOCKED)
// в конце партии. Чтобы не выпрыгивать одной модалкой поверх другой, держим
// FIFO-очередь и показываем по одному за раз — пользователь видит каждую
// ачивку и нажимает «Спасибо», очередь сдвигается.
//
// Стор глобальный (singleton) — модалка живёт на уровне App, а подписка
// на Socket.IO событие висит в game-connection hook.

import { create } from 'zustand';

import type { EarnedAchievementPayload } from '@mafia/shared';

interface AchievementUnlockStore {
  queue: EarnedAchievementPayload[];
  enqueue: (achievements: EarnedAchievementPayload[]) => void;
  dismissCurrent: () => void;
  clear: () => void;
}

export const useAchievementUnlockStore = create<AchievementUnlockStore>((set) => ({
  queue: [],
  enqueue: (achievements) =>
    set((state) => ({
      queue: [...state.queue, ...achievements],
    })),
  dismissCurrent: () =>
    set((state) => ({
      queue: state.queue.slice(1),
    })),
  clear: () => set({ queue: [] }),
}));
