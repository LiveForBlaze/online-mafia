// Server-side game state. Strictly internal — never sent to clients without going
// through projectFor() in game.engine.ts, which strips fields the viewer must not see.

import { GAME_PHASE, type GamePhase, type Role, type Team } from '@mafia/shared';

export interface GameParticipant {
  userId: string;
  nickname: string;
  // Public profile code, propagated through projection so clients can deep-link
  // each nickname to /u/:code. Optional because recovery from old event rows
  // / older code paths may surface a participant without this field set yet.
  publicCode?: string;
  avatarUrl: string | null;
  seat: number | null; // null for judge
  isJudge: boolean;
  isBot: boolean;
  role: Role | null; // null for judge; null for players before distribution
  isAlive: boolean;
  isRemoved: boolean;
  foulsCount: number;
  hasSpokenThisDay: boolean;
}

export interface GameState {
  id: string;
  lobbyId: string;
  rulesetSlug: string;
  status: 'in_progress' | 'finished';

  phase: GamePhase;
  dayNumber: number;

  // Wall-clock timestamps for the current phase / speaker timer.
  // Reset on every phase transition and on every "next speaker" press.
  // Both null when the phase has no timer (lobby, game_over).
  phaseStartedAt: Date | null;
  phaseDeadline: Date | null;

  participants: GameParticipant[];

  // Day-time transient state. Cleared on day start.
  currentSpeakerSeat: number | null;
  // The seat whose speech produced the most recent nomination. While this
  // equals currentSpeakerSeat, the judge cannot nominate again — one
  // nomination per speech per ФИИМ. Cleared on every advanceSpeaker so the
  // next speaker starts with a fresh quota.
  lastNominatorSeat: number | null;
  nominationSeats: number[];
  votes: Map<number, number>; // voter seat → candidate seat
  // ФИИМ-style sequential voting: each candidate from nominationSeats is
  // polled in order, one round at a time. voteRoundIdx is the index of the
  // candidate being voted on RIGHT NOW; when the judge advances past the
  // last round the engine auto-casts every remaining alive voter for the
  // last candidate. Reset to 0 on every DAY_VOTE / DAY_REVOTE entry.
  voteRoundIdx: number;

  // Night-time transient state. Cleared at the end of each morning.
  //
  // mafiaVotes holds one entry per shooter (mafia + don) — voterSeat → targetSeat.
  // Resolution at the end of night requires all alive black players to have voted
  // AND voted for the same target; otherwise nobody dies (the "miss" rule of
  // sport mafia). pendingMafiaTargetSeat mirrors the most recent write for
  // backward-compatible projection — the UI shows it during the night so the
  // mafia team has a hint of where the discussion is converging.
  mafiaVotes: Map<number, number>;
  pendingMafiaTargetSeat: number | null;
  sheriffCheck: { byUserId: string; targetSeat: number; result: boolean } | null;
  donCheck: { byUserId: string; targetSeat: number; result: boolean } | null;

  // Set during morning_announcement so clients can show "who died".
  lastNightVictimSeat: number | null;

  // "Said out of turn" window. When a non-speaker player presses the foul
  // button, the server records a foul and opens their audio for 5 seconds
  // by writing this field. Clients use it to grant audibility to one
  // specific player for the duration.
  outOfTurnSpeaker: { userId: string; until: number } | null;

  // Farewell minute. When a player is killed at night, the next day starts
  // with their last word — they're dead but still audible and visible to
  // everyone, can speak but cannot nominate. Cleared after that one speaker
  // turn is over and the regular speech round begins.
  farewellSeat: number | null;

  // Last word given immediately after a day-vote elimination (and after a
  // shoot-all multi-elimination, when that ruleset path is on). The queue
  // exists so a multi-victim elimination plays out one speaker at a time;
  // for the common single-winner case there's exactly one seat in the list.
  // applyAdvancePhase enters DAY_LAST_WORD when this list is non-empty and
  // exits to NIGHT_MAFIA when the index walks past the end.
  lastWordSeats: number[];
  lastWordIdx: number;

  // Tie-break trail. Filled when the first vote ends in a tie of 2+ seats:
  // each gets a short shootout speech (DAY_SHOOTOUT) and then they're the
  // only legal candidates for the revote (DAY_REVOTE). Cleared once the
  // tie-break path resolves (either someone wins on the revote, or it ties
  // again and we head to night with no kill — the V0 simplification of the
  // ФИИМ "поднять всех" branch).
  tiedSeats: number[];
  // Index into tiedSeats during DAY_SHOOTOUT. Each call to applyNextSpeaker
  // hands the floor to the next tied seat.
  shootoutSpeakerIdx: number;

  // "Lift all" yes/no ballots cast during DAY_LIFT_VOTE — voterSeat → vote.
  // Resolved at the phase exit: simple majority of cast ballots kills every
  // seat in tiedSeats. Cleared when DAY_LIFT_VOTE exits.
  liftAllVotes: Map<number, boolean>;

  // "Best move" (Лучший Ход) guesses made by eliminated players during their
  // last word. One entry per eliminated player; they nominate 1–3 seats they
  // think are the mafia team. Scored by a future stats / tournament module
  // — the engine only records the raw guess here. Persisted with the game
  // state so it survives recovery.
  bestMoveGuesses: { byUserId: string; guessedSeats: number[] }[];

  winner: Team | null;

  // ROLE_DISTRIBUTION card-pick illusion. Each player clicks one of 10
  // face-down cards in seat order; the role they get is the one already
  // pre-rolled for their seat by assignRoles() — the click only times the
  // reveal and removes a visual card from the wall. Picker rotates seat 1
  // → seat 2 → … → seat 10. When everyone has picked, roleCardPickerSeat
  // becomes null and the judge can advance the phase.
  // roleCardsPicked holds the card indices picked so far in pick order, so
  // position 0 == seat 1's card, position 1 == seat 2's, etc.
  roleCardPickerSeat: number | null;
  roleCardsPicked: number[];

  // Per ФИИМ: if a player is disqualified (judge-removed, foul-removed,
  // or self-leave) during any day phase BEFORE the vote result is known —
  // including DAY_SPEECH, DAY_VOTE, DAY_SHOOTOUT, DAY_REVOTE, DAY_LIFT_VOTE —
  // the current day's vote is cancelled and the table goes straight to night.
  // Flag is set inside applyJudgeRemove and cleared at MORNING_ANNOUNCEMENT
  // start (next day's apply path).
  disqualifiedThisDay: boolean;

  // ФИИМ rule: "Лучший Ход" is granted to the player killed on the FIRST
  // night — unless during Day 1 the table eliminated two or more players by
  // vote (lift-all kill). In that case the first-night victim gets no LH.
  // We track that with this flag, set when DAY_LIFT_VOTE on dayNumber=0
  // produces a multi-kill. Never cleared — only one first-night victim per
  // game.
  firstDayMultiVoteKill: boolean;

  // Monotonic event sequence (mirrors GameEvent.seq in the database).
  nextEventSeq: number;
}

export function isLivePlayer(p: GameParticipant): boolean {
  return !p.isJudge && p.isAlive && !p.isRemoved;
}

export function alivePlayers(state: GameState): GameParticipant[] {
  return state.participants.filter(isLivePlayer);
}

export function findBySeat(state: GameState, seat: number): GameParticipant | undefined {
  return state.participants.find((p) => p.seat === seat);
}

export function findByUserId(state: GameState, userId: string): GameParticipant | undefined {
  return state.participants.find((p) => p.userId === userId);
}

// Games now open with the player-introduction phase so newcomers have a
// moment to say hi on open mic before roles are dealt.
export const INITIAL_PHASE: GamePhase = GAME_PHASE.PLAYER_INTRODUCTION;
