// Decides whether the viewer is allowed to see/hear a specific participant.
//
// Cameras + microphones are owned by the player and never disabled by game
// mechanics — these functions only control the *projection* on the viewer's
// side: which remote tracks get rendered.
//
// IMPORTANT — client-side enforcement only. A determined player can bypass it
// from DevTools because the underlying LiveKit subscription is still active.
// Before going to production we must enforce visibility server-side via LiveKit's
// RoomServiceClient (updateSubscriptions / setParticipantPermissions). See ROADMAP.

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
  targetSeat: number | null;
  targetRole: Role | null;
  targetIsJudge: boolean;
  targetIsAlive: boolean;

  // Day-phase: whose minute it is right now.
  currentSpeakerSeat: number | null;
  // 5-second "said out of turn" window — that user is audible to everyone for its duration.
  outOfTurnSpeaker: { userId: string; until: number } | null;
}

// Video projection: what the viewer SEES.
// Night = no other live tiles for civilians/sheriff; mafia team sees each other.
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

  if (!targetIsAlive) return false;
  if (targetUserId === viewerUserId) return true;
  if (viewerIsJudge) return true;
  if (!viewerIsAlive) return true;
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  if (
    phase === GAME_PHASE.ROLE_DISTRIBUTION ||
    phase === GAME_PHASE.MORNING_ANNOUNCEMENT ||
    DAY_PHASES.includes(phase)
  ) {
    return true;
  }

  const viewerIsMafiaTeam = viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON;
  const targetIsMafiaTeam = targetRole === ROLE.MAFIA || targetRole === ROLE.DON;

  if (phase === GAME_PHASE.NIGHT_ZERO || phase === GAME_PHASE.NIGHT_MAFIA) {
    return viewerIsMafiaTeam && targetIsMafiaTeam;
  }

  return false;
}

// Audio projection: what the viewer HEARS. Tighter than video.
// During the day the table is silent except for the current speaker's minute.
// Players can break silence by pressing "Сказать под фол" — they get a foul
// and a 5-second window during which their audio is audible to everyone.
export function shouldHearParticipantAudio(args: MediaVisibilityArgs): boolean {
  const {
    phase,
    status,
    viewerUserId,
    viewerRole,
    viewerIsJudge,
    viewerIsAlive,
    targetUserId,
    targetSeat,
    targetRole,
    targetIsJudge,
    targetIsAlive,
    currentSpeakerSeat,
    outOfTurnSpeaker,
  } = args;

  // Speak-to-yourself is never useful and produces feedback — drop own audio.
  if (targetUserId === viewerUserId) return false;
  if (!targetIsAlive) return false;

  // Judge is always audible (announcements, calls) and can always hear everyone.
  if (targetIsJudge) return true;
  if (viewerIsJudge) return true;

  // Active "out of turn" window — that one player is heard by everyone.
  if (outOfTurnSpeaker && outOfTurnSpeaker.userId === targetUserId) {
    return true;
  }

  // Dead spectators hear everything.
  if (!viewerIsAlive) return true;

  // Game over — open mic.
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  // Day phases: only the current speaker's minute is audible.
  if (DAY_PHASES.includes(phase)) {
    return targetSeat !== null && targetSeat === currentSpeakerSeat;
  }

  // Night phases: the table is fully silent for players. The mafia sees each
  // other on video and coordinates by gestures — they do not hear each other.
  // Sheriff / don checks are silent picks; the judge handles announcements.
  // (Role distribution and morning announcement also fall through to silent;
  // players only hear the judge, who's already returned true above.)
  // The `viewerRole` / `targetRole` / `ROLE` imports are still used by the
  // video-visibility function above.
  void viewerRole;
  void targetRole;
  return false;
}
