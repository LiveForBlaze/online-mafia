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
  // Wall-clock deadline of the current speaker's minute. Once it passes, the
  // speaker's mic is silenced until the judge advances to the next speaker.
  // ISO datetime string or null when the phase has no timer.
  phaseDeadline: string | null;
  // Server's "now" for deciding whether `phaseDeadline` has passed. Clients
  // pass Date.now() and refresh on a tick so the cutoff is felt without a
  // dedicated state update.
  now: number;
  // 5-second "said out of turn" window — that user is audible to everyone for its duration.
  outOfTurnSpeaker: { userId: string; until: number } | null;
  // Farewell speaker — the night-killed player gets a minute at the start of
  // the next day. They are dead (`targetIsAlive=false`) yet should still be
  // audible during their farewell, so the audio rule needs to know about it.
  farewellSeat: number | null;
}

// Video projection: what the viewer SEES.
// Night = no other live tiles for civilians/sheriff. Only NIGHT_ZERO (the
// 1-minute "mafia meeting") lets the mafia team see each other on video;
// NIGHT_MAFIA and the rest of the night are fully blacked out for everyone.
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

  if (phase === GAME_PHASE.NIGHT_ZERO) {
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
    phaseDeadline,
    now,
    outOfTurnSpeaker,
    farewellSeat,
  } = args;

  // Speak-to-yourself is never useful and produces feedback — drop own audio.
  if (targetUserId === viewerUserId) return false;

  // Judge is always audible (announcements, calls) and can always hear everyone.
  if (targetIsJudge) return true;
  if (viewerIsJudge) return true;

  // Active "out of turn" window — that one player is heard by everyone.
  if (outOfTurnSpeaker && outOfTurnSpeaker.userId === targetUserId) {
    return true;
  }

  // Farewell speaker (a night-killed player giving their last word at the
  // start of the next day) is audible to everyone — even though they're dead.
  if (farewellSeat !== null && targetSeat === farewellSeat) {
    return !isDeadlinePast(phaseDeadline, now);
  }

  // From this point on, dead players have no audio.
  if (!targetIsAlive) return false;

  // Dead spectators hear everything.
  if (!viewerIsAlive) return true;

  // Game over — open mic.
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  // Day phases: only the current speaker's minute is audible, and only until
  // their minute timer expires. After the deadline the mic is silenced until
  // the judge advances to the next speaker.
  if (DAY_PHASES.includes(phase)) {
    if (targetSeat === null || targetSeat !== currentSpeakerSeat) return false;
    return !isDeadlinePast(phaseDeadline, now);
  }

  // Night phases: the table is fully silent for players. The mafia sees each
  // other on video (only on NIGHT_ZERO) and coordinates by gestures.
  void viewerRole;
  void targetRole;
  return false;
}

function isDeadlinePast(deadline: string | null, now: number): boolean {
  if (!deadline) return false;
  const dl = Date.parse(deadline);
  if (Number.isNaN(dl)) return false;
  return now > dl;
}
