// Hooks that decide whether the viewer is allowed to see / hear a specific
// participant's stream. Components call them per participant they render.
//
// Audio rule depends on a wall-clock deadline (the current speaker's minute),
// so the audio hook ticks every 500 ms — that way the mic is silenced the
// moment the minute expires, without waiting for the next server push.

import { useEffect, useState } from 'react';

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import {
  shouldHearParticipantAudio,
  shouldShowParticipantMedia,
  type MediaVisibilityArgs,
} from '@/features/game/lib/media-visibility.js';

function useMediaArgs(targetUserId: string, now: number): MediaVisibilityArgs | null {
  const viewerId = useAuthStore((s) => s.user?.id);
  const state = useGameStore((s) => s.state);
  const judgeOverhearAll = useGameStore((s) => s.judgeOverhearAll);

  if (!viewerId || !state) return null;

  const viewer = state.participants.find((p) => p.userId === viewerId);
  const target = state.participants.find((p) => p.userId === targetUserId);
  if (!viewer || !target) return null;

  return {
    phase: state.phase,
    status: state.status,
    viewerUserId: viewerId,
    viewerRole: viewer.role,
    viewerIsJudge: viewer.isJudge,
    viewerIsAlive: viewer.isAlive,
    targetUserId: target.userId,
    targetSeat: target.seat,
    targetRole: target.role,
    targetIsJudge: target.isJudge,
    targetIsAlive: target.isAlive,
    currentSpeakerSeat: state.currentSpeakerSeat,
    phaseDeadline: state.phaseDeadline,
    now,
    outOfTurnSpeaker: state.outOfTurnSpeaker,
    farewellSeat: state.farewellSeat ?? null,
    lastWordSeat: state.lastWordSeat ?? null,
    judgeOverhearAll,
  };
}

export function useShouldShowMedia(targetUserId: string): boolean {
  const args = useMediaArgs(targetUserId, Date.now());
  if (!args) return false;
  return shouldShowParticipantMedia(args);
}

// Tick hook used by audio routing to revisit deadline checks twice a second.
function useNowTick(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useShouldHearAudio(targetUserId: string): boolean {
  const now = useNowTick(500);
  const args = useMediaArgs(targetUserId, now);
  if (!args) return false;
  return shouldHearParticipantAudio(args);
}
