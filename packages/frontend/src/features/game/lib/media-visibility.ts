// Decides whether the viewer is allowed to see a specific participant's video and audio.
//
// IMPORTANT — this is client-side enforcement only. A determined player can bypass it
// from DevTools because the underlying LiveKit subscription is still active.
// Before going to production we must enforce visibility server-side via LiveKit's
// RoomServiceClient (updateSubscriptions / setParticipantPermissions) on every phase
// transition. See ROADMAP.

import {
  DAY_PHASES,
  GAME_PHASE,
  ROLE,
  type GamePhase,
  type GameStatus,
  type Role,
} from '@mafia/shared';

export interface MediaVisibilityArgs {
  phase: GamePhase;
  status: GameStatus;

  viewerUserId: string;
  viewerRole: Role | null;
  viewerIsJudge: boolean;
  viewerIsAlive: boolean;

  targetUserId: string;
  targetRole: Role | null;
  targetIsJudge: boolean;
  targetIsAlive: boolean;
}

export function shouldShowParticipantMedia(args: MediaVisibilityArgs): boolean {
  const {
    phase,
    status,
    viewerUserId,
    viewerRole,
    viewerIsJudge,
    viewerIsAlive,
    targetUserId,
    targetRole,
    targetIsAlive,
  } = args;

  // Dead players don't broadcast — their tile is replaced by a "killed" marker,
  // no video/audio rendered for anyone, including themselves.
  if (!targetIsAlive) return false;

  // You always see your own preview tile (while alive).
  if (targetUserId === viewerUserId) return true;

  // Judge has full visibility at every moment of the game.
  if (viewerIsJudge) return true;

  // Dead players become spectators — they see and hear everything like the judge.
  if (!viewerIsAlive) return true;

  // Game over — everyone is revealed.
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  // Daytime, role-distribution and morning announcement: all visible.
  if (
    phase === GAME_PHASE.ROLE_DISTRIBUTION ||
    phase === GAME_PHASE.MORNING_ANNOUNCEMENT ||
    DAY_PHASES.includes(phase)
  ) {
    return true;
  }

  // Night phases:
  // night_zero and night_mafia — the mafia team (mafia + don) coordinates and sees
  // each other; civilians and sheriff see no other live tiles.
  const viewerIsMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
  const targetIsMafiaTeam = targetRole === ROLE.MAFIA || targetRole === ROLE.DON;

  if (phase === GAME_PHASE.NIGHT_ZERO || phase === GAME_PHASE.NIGHT_MAFIA) {
    return viewerIsMafiaTeam && targetIsMafiaTeam;
  }

  // Don and sheriff checks happen in private — only the actor sees anything,
  // and even then they only see their own preview tile (handled above).
  return false;
}
