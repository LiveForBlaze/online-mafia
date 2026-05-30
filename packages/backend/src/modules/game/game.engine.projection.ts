// Per-viewer state projection — strips role / night info each viewer must
// not see. All pure.

import { GAME_PHASE, ROLE, type GameStateProjected } from '@mafia/shared';

import { findByUserId, type GameParticipant, type GameState } from './game.state.js';

// ---- Projection ----

/**
 * Build the state to send to a specific viewer. The viewer sees:
 *   - everyone's role only if the game is over or the viewer is the judge
 *   - their own role always
 *   - other mafia/don roles if the viewer is mafia or don
 *   - night targets and check results filtered by role and phase
 */
export function projectFor(state: GameState, viewerUserId: string): GameStateProjected {
  const viewer = findByUserId(state, viewerUserId);
  const isJudge = viewer?.isJudge ?? false;
  const isMafiaTeam = viewer?.role === ROLE.MAFIA || viewer?.role === ROLE.DON;
  const isGameOver = state.status === 'finished';
  const isMorning = state.phase === GAME_PHASE.MORNING_ANNOUNCEMENT;
  const isPlayerIntro = state.phase === GAME_PHASE.PLAYER_INTRODUCTION;

  const participants = state.participants.map((p) => ({
    userId: p.userId,
    nickname: p.nickname,
    publicCode: p.publicCode,
    avatarUrl: p.avatarUrl,
    seat: p.seat,
    isJudge: p.isJudge,
    isBot: p.isBot,
    role: shouldRevealRole(p, viewer, isJudge, isMafiaTeam, isGameOver, isPlayerIntro, state)
      ? p.role
      : null,
    isAlive: p.isAlive,
    isRemoved: p.isRemoved,
    foulsCount: p.foulsCount,
    hasSpokenThisDay: p.hasSpokenThisDay,
  }));

  const myCheck = (() => {
    if (!viewer) return null;
    if (viewer.role === ROLE.SHERIFF && state.sheriffCheck?.byUserId === viewer.userId) {
      return { targetSeat: state.sheriffCheck.targetSeat, result: state.sheriffCheck.result };
    }
    if (viewer.role === ROLE.DON && state.donCheck?.byUserId === viewer.userId) {
      return { targetSeat: state.donCheck.targetSeat, result: state.donCheck.result };
    }
    return null;
  })();

  // Mafia target visibility:
  //   - judge: always (для модерации);
  //   - чёрная команда: всегда видит свой пендинг (для координации ночью);
  //   - все игроки утром: только если ночь закончилась УБИЙСТВОМ (consensus
  //     hit). При промахе показывать «куда чёрные хотели стрелять» — это
  //     утечка их выбора красным; скрываем;
  //   - после game_over: всё открыто.
  const morningHit = isMorning && state.lastNightVictimSeat !== null;
  const showMafiaTarget = isJudge || isMafiaTeam || morningHit || isGameOver;

  return {
    id: state.id,
    lobbyId: state.lobbyId,
    rulesetSlug: state.rulesetSlug,
    status: state.status,
    phase: state.phase,
    dayNumber: state.dayNumber,
    phaseStartedAt: state.phaseStartedAt?.toISOString() ?? null,
    phaseDeadline: state.phaseDeadline?.toISOString() ?? null,
    participants,
    currentSpeakerSeat: state.currentSpeakerSeat,
    // During the sequential vote (DAY_VOTE / DAY_REVOTE) the players don't
    // see the full nomination list — the judge calls names aloud and they
    // only react to the candidate of the current round. Project a single-
    // element list with the current candidate and pin voteRoundIdx=0 so
    // their UI naturally shows just "voting for №X". Judge always sees
    // the full picture for orchestration.
    nominationSeats: hideNominationList(state, isJudge)
      ? state.nominationSeats[state.voteRoundIdx] !== undefined
        ? [state.nominationSeats[state.voteRoundIdx]!]
        : []
      : state.nominationSeats,
    votes: Object.fromEntries([...state.votes].map(([k, v]) => [String(k), v])),
    voteRoundIdx: hideNominationList(state, isJudge) ? 0 : state.voteRoundIdx,
    // Whether the current speaker has already had a nomination called.
    // UI uses this to hide the judge's "Выставить" buttons once one click
    // has landed for that speech — one nomination per speech per ФИИМ.
    nominationLockedForSpeaker: state.lastNominatorSeat === state.currentSpeakerSeat,
    pendingMafiaTargetSeat: showMafiaTarget ? state.pendingMafiaTargetSeat : null,
    lastNightVictimSeat: state.lastNightVictimSeat,
    // Drop the field once it has expired so clients don't have to do timer
    // bookkeeping just to fall back to the silent default.
    outOfTurnSpeaker:
      state.outOfTurnSpeaker && state.outOfTurnSpeaker.until > Date.now()
        ? state.outOfTurnSpeaker
        : null,
    farewellSeat: state.farewellSeat,
    // Active last-word speaker (dead from a day-vote elimination) — distinct
    // from farewellSeat (overnight kill speaking the next morning). Media
    // visibility hooks grant audio to whichever of the two is set.
    lastWordSeat: state.lastWordSeats[state.lastWordIdx] ?? null,
    // Tied candidates during DAY_SHOOTOUT / DAY_REVOTE so the UI can
    // highlight who's in contention.
    tiedSeats: state.tiedSeats,
    // Whether this viewer (if mafia/don) has cast their consensus vote this
    // night, so the UI can hide the "shoot" button after their own pick. We
    // deliberately don't expose other shooters' picks here — coordination
    // happens in-game, not via leaked state.
    myMafiaVote:
      viewer && viewer.seat !== null && (viewer.role === ROLE.MAFIA || viewer.role === ROLE.DON)
        ? (state.mafiaVotes.get(viewer.seat) ?? null)
        : null,
    // Public audit trail of Лучший Ход submissions. Shown to everyone since
    // it's a publicly-spoken move; future stats module will score them.
    bestMoveGuesses: state.bestMoveGuesses,
    // Lift-all vote tally — counts only, no per-voter breakdown.
    liftAllTally: liftAllTally(state),
    // The viewer's own lift-all vote so the UI can lock the buttons after
    // they've cast their ballot.
    myLiftAllVote:
      viewer && viewer.seat !== null ? (state.liftAllVotes.get(viewer.seat) ?? null) : null,
    myCheckResult: myCheck,
    // ROLE_DISTRIBUTION card-pick state. roleCardPickerSeat tells everyone
    // whose turn it is; roleCardsPicked lists indices already removed from
    // the wall so the modal can dim/remove them. myRoleCardIndex is the
    // card the viewer themselves picked (or null until they have) so the
    // UI can highlight their flipped card.
    roleCardPickerSeat: state.roleCardPickerSeat,
    roleCardsPicked: state.roleCardsPicked,
    myRoleCardIndex:
      viewer && viewer.seat !== null && state.roleCardsPicked.length >= viewer.seat
        ? (state.roleCardsPicked[viewer.seat - 1] ?? null)
        : null,
    winner: state.winner,
  };
}

function hideNominationList(state: GameState, isJudge: boolean): boolean {
  if (isJudge) return false;
  return state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE;
}

function liftAllTally(state: GameState): { yes: number; no: number } {
  let yes = 0;
  let no = 0;
  for (const v of state.liftAllVotes.values()) {
    if (v) yes += 1;
    else no += 1;
  }
  return { yes, no };
}

function shouldRevealRole(
  target: GameParticipant,
  viewer: GameParticipant | undefined,
  isJudge: boolean,
  isMafiaTeam: boolean,
  isGameOver: boolean,
  isPlayerIntro: boolean,
  state?: GameState,
): boolean {
  if (isJudge) return true;
  if (isGameOver) return true;
  // During the intro phase nobody knows their role yet — roles are dealt
  // at the next phase transition. The judge gets the override above.
  if (isPlayerIntro) return false;
  if (!viewer) return false;
  // ROLE_DISTRIBUTION: own role is revealed only after the player has picked
  // their card (seats pick in order, so position i in roleCardsPicked is
  // seat i+1's pick). Until then the viewer's modal shows face-down cards.
  if (state && state.phase === GAME_PHASE.ROLE_DISTRIBUTION) {
    if (target.userId !== viewer.userId) return false;
    if (viewer.seat === null) return false;
    return state.roleCardsPicked.length >= viewer.seat;
  }
  if (target.userId === viewer.userId) return true;
  if (isMafiaTeam && (target.role === ROLE.MAFIA || target.role === ROLE.DON)) return true;
  return false;
}
