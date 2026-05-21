// Numeric constants of the classic sport mafia game.
// Anything that varies between rulesets lives in the ruleset config (YAML), not here.
// This file captures only invariants of the classic 10-player setup.

export const GAME = {
  // Total number of players at a single table (judge does not count).
  TOTAL_PLAYERS: 10,

  // Seat numbers are 1-based (1 through 10), to match the real-life seat numbering at tournaments.
  FIRST_SEAT: 1,
  LAST_SEAT: 10,
} as const;

// Foul thresholds per classic ФИИМ:
//   3 fouls → player loses the right to speak for the rest of the game
//     (skipped in the speech rotation and cannot nominate, since nomination
//     requires being the current speaker). They retain the right to vote.
//   4 fouls → technical loss — treated identically to a judge removal.
export const FOUL_MUTE_THRESHOLD = 3;
export const FOUL_REMOVE_THRESHOLD = 4;

export const ROLE_COUNTS = {
  CIVILIAN: 6,
  SHERIFF: 1,
  MAFIA: 2,
  DON: 1,
} as const;

// Compile-time guard that role counts add up to total players.
// If this assertion ever fails, the game would not deal correctly.
type RoleCountSum =
  | typeof ROLE_COUNTS.CIVILIAN
  | typeof ROLE_COUNTS.SHERIFF
  | typeof ROLE_COUNTS.MAFIA
  | typeof ROLE_COUNTS.DON;
const _roleCountsAddUp: RoleCountSum extends number ? typeof GAME.TOTAL_PLAYERS : never = 10;
void _roleCountsAddUp;

// Default phase durations (in seconds). Eventually these come from a ruleset YAML
// config; for V0 we hardcode reasonable defaults. A duration of 0 means "no timer"
// (the phase ends only on judge action) — used for lobby and game_over.
import { GAME_PHASE, type GamePhase } from './phases.js';

export const DEFAULT_PHASE_DURATION_SEC: Record<GamePhase, number> = {
  [GAME_PHASE.LOBBY]: 0,
  [GAME_PHASE.ROLE_DISTRIBUTION]: 30,
  [GAME_PHASE.NIGHT_ZERO]: 30,
  // The day_speech timer is per-speaker, not for the whole day. It resets every
  // time the judge advances to the next speaker.
  [GAME_PHASE.DAY_SPEECH]: 60,
  [GAME_PHASE.DAY_VOTE]: 30,
  [GAME_PHASE.DAY_REVOTE]: 30,
  [GAME_PHASE.DAY_SHOOTOUT]: 60,
  [GAME_PHASE.DAY_LAST_WORD]: 60,
  [GAME_PHASE.NIGHT_MAFIA]: 45,
  [GAME_PHASE.NIGHT_DON]: 15,
  [GAME_PHASE.NIGHT_SHERIFF]: 15,
  [GAME_PHASE.MORNING_ANNOUNCEMENT]: 15,
  [GAME_PHASE.GAME_OVER]: 0,
};
