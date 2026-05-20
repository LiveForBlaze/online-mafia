// Hooks that decide whether the viewer is allowed to see / hear a specific
// participant's stream. Components call them per participant they render.
//
// Video and audio are kept separate because their rules differ — at day the
// table is silent except for the current speaker, but every live player's
// video is visible.

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import {
  shouldHearParticipantAudio,
  shouldShowParticipantMedia,
  type MediaVisibilityArgs,
} from '@/features/game/lib/media-visibility.js';

function useMediaArgs(targetUserId: string): MediaVisibilityArgs | null {
  const viewerId = useAuthStore((s) => s.user?.id);
  const state = useGameStore((s) => s.state);

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
    outOfTurnSpeaker: state.outOfTurnSpeaker,
  };
}

export function useShouldShowMedia(targetUserId: string): boolean {
  const args = useMediaArgs(targetUserId);
  if (!args) return false;
  return shouldShowParticipantMedia(args);
}

export function useShouldHearAudio(targetUserId: string): boolean {
  const args = useMediaArgs(targetUserId);
  if (!args) return false;
  return shouldHearParticipantAudio(args);
}
