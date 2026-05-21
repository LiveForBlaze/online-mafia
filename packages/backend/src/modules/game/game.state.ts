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
  nominationSeats: number[];
  votes: Map<number, number>; // voter seat → candidate seat

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

  winner: Team | null;

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

export const INITIAL_PHASE: GamePhase = GAME_PHASE.ROLE_DISTRIBUTION;
