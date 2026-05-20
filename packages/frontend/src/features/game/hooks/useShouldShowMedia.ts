// Hook that resolves "can the viewer see/hear this participant's stream" using the
// current auth + game store state. Components call it per participant they render.

import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import { shouldShowParticipantMedia } from '@/features/game/lib/media-visibility.js';

export function useShouldShowMedia(targetUserId: string): boolean {
  const viewerId = useAuthStore((s) => s.user?.id);
  const state = useGameStore((s) => s.state);

  if (!viewerId || !state) return false;

  const viewer = state.participants.find((p) => p.userId === viewerId);
  const target = state.participants.find((p) => p.userId === targetUserId);

  if (!viewer || !target) return false;

  return shouldShowParticipantMedia({
    phase: state.phase,
    status: state.status,
    viewerUserId: viewerId,
    viewerRole: viewer.role,
    viewerIsJudge: viewer.isJudge,
    viewerIsAlive: viewer.isAlive,
    targetUserId: target.userId,
    targetRole: target.role,
    targetIsJudge: target.isJudge,
    targetIsAlive: target.isAlive,
  });
}
