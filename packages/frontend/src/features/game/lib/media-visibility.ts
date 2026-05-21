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
  // Last-word speaker — a player just eliminated by the day vote. Same
  // dead-but-audible semantic as farewellSeat, distinct field so the UI
  // can label the two situations differently if it wants to.
  lastWordSeat: number | null;
}

// Video projection: what the viewer SEES.
//
// Rules per the project owner:
//   - Dead players: never visible
//   - Judge camera: always visible (even at night, while the table is dark)
//   - PLAYER_INTRODUCTION: everyone visible — open intros before roles
//   - Day phases + MORNING_ANNOUNCEMENT: every alive player visible
//   - ROLE_DISTRIBUTION: night-like (only judge), so players focus on their
//     own card without being distracted by other faces
//   - NIGHT_ZERO: mafia + don see each other (1-minute "знакомство мафии"),
//     others see nothing
//   - Other NIGHT_*: nothing visible to anyone except the judge
//   - GAME_OVER: everyone visible (post-game review)
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
    targetIsJudge,
  } = args;

  // Judge camera is always live to everyone — they're the one running the
  // game and the table needs to see them, including during the night.
  if (targetIsJudge) return true;

  // Dead-but-speaking exception: a player giving their farewell minute
  // (overnight kill) or last word (day-vote elimination) keeps both camera
  // and mic live until their minute ends. Without this, the eliminated
  // player could neither be heard nor seen during their own speech.
  if (
    !targetIsAlive &&
    args.targetSeat !== null &&
    (args.targetSeat === args.farewellSeat || args.targetSeat === args.lastWordSeat) &&
    !isDeadlinePast(args.phaseDeadline, args.now)
  ) {
    return true;
  }

  if (!targetIsAlive) return false;
  if (targetUserId === viewerUserId) return true;
  if (viewerIsJudge) return true;
  if (!viewerIsAlive) return true;
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  if (
    phase === GAME_PHASE.PLAYER_INTRODUCTION ||
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

  // ROLE_DISTRIBUTION and the rest of the night phases: only the judge tile
  // (handled above). Players see a dark table.
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
    lastWordSeat,
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

  // Last-word speaker (just eliminated by day vote, speaking immediately
  // before night). Same dead-but-audible logic as farewell.
  if (lastWordSeat !== null && targetSeat === lastWordSeat) {
    return !isDeadlinePast(phaseDeadline, now);
  }

  // From this point on, dead players have no audio.
  if (!targetIsAlive) return false;

  // Dead spectators hear everything.
  if (!viewerIsAlive) return true;

  // Game over — open mic.
  if (status === 'finished' || phase === GAME_PHASE.GAME_OVER) return true;

  // Open-mic introduction phase: every alive player is audible to everyone.
  if (phase === GAME_PHASE.PLAYER_INTRODUCTION) return true;

  // Day phases: only the current speaker's minute is audible, and only until
  // their minute timer expires. After the deadline the mic is silenced until
  // the judge advances to the next speaker.
  if (DAY_PHASES.includes(phase)) {
    if (targetSeat === null || targetSeat !== currentSpeakerSeat) return false;
    return !isDeadlinePast(phaseDeadline, now);
  }

  // Night phases (including ROLE_DISTRIBUTION which we treat as a night
  // phase media-wise): the table is fully silent for players. The mafia
  // see each other on video during NIGHT_ZERO but still coordinate by
  // gestures — no audio.
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
