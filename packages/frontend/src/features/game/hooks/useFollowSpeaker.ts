// Mobile BIG-tile derivation.
// `resolveActiveSeat` is a pure function so it can be unit-tested without
// React. `useFollowSpeaker` is the thin hook wrapper that wires it to the
// current game state and the zustand store.

import type { GameStateProjected } from '@mafia/shared';

import { useGameStore } from '@/features/game/store/game.store.js';

export interface ActiveSeatInputs {
  pinnedSeat: number | null;
  isFollowingSpeaker: boolean;
  currentSpeakerSeat: number | null;
  farewellSeat: number | null;
  lastWordSeat: number | null;
}

export function resolveActiveSeat(args: ActiveSeatInputs): number | null {
  if (args.pinnedSeat !== null) return args.pinnedSeat;
  if (args.farewellSeat !== null) return args.farewellSeat;
  if (args.lastWordSeat !== null) return args.lastWordSeat;
  if (args.currentSpeakerSeat !== null) return args.currentSpeakerSeat;
  return null;
}

export interface UseFollowSpeakerResult {
  activeSeat: number | null;
  isPinned: boolean;
  isFollowing: boolean;
  pinSeat: (seat: number) => void;
  enableFollow: () => void;
}

export function useFollowSpeaker(state: GameStateProjected | null): UseFollowSpeakerResult {
  const pinnedSeat = useGameStore((s) => s.pinnedSeat);
  const isFollowingSpeaker = useGameStore((s) => s.isFollowingSpeaker);
  const pinSeatStore = useGameStore((s) => s.pinSeat);
  const enableFollow = useGameStore((s) => s.enableFollowSpeaker);

  const activeSeat = resolveActiveSeat({
    pinnedSeat,
    isFollowingSpeaker,
    currentSpeakerSeat: state?.currentSpeakerSeat ?? null,
    farewellSeat: state?.farewellSeat ?? null,
    lastWordSeat: state?.lastWordSeat ?? null,
  });

  return {
    activeSeat,
    isPinned: pinnedSeat !== null,
    isFollowing: isFollowingSpeaker,
    pinSeat: pinSeatStore,
    enableFollow,
  };
}
