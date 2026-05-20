// Lobby-related invariants and limits.
// Anything that changes between rulesets lives in the ruleset config, not here.

import { GAME } from './game.js';

export const LOBBY = {
  // A lobby fits exactly the same number of players as the game it leads to.
  PLAYER_SLOTS: GAME.TOTAL_PLAYERS,
  JUDGE_SLOTS: 1,
  get MAX_MEMBERS(): number {
    return this.PLAYER_SLOTS + this.JUDGE_SLOTS;
  },

  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 64,

  // Lobby passwords are short and meant only for inviting friends — they are not
  // a security boundary for sensitive data. We still hash them with argon2.
  PASSWORD_MIN_LENGTH: 4,
  PASSWORD_MAX_LENGTH: 64,
} as const;

export const LOBBY_STATUS = {
  WAITING: 'waiting',
  IN_GAME: 'in_game',
  CLOSED: 'closed',
} as const;
export type LobbyStatus = (typeof LOBBY_STATUS)[keyof typeof LOBBY_STATUS];

export const MEMBER_ROLE = {
  PLAYER: 'player',
  JUDGE: 'judge',
} as const;
export type MemberRole = (typeof MEMBER_ROLE)[keyof typeof MEMBER_ROLE];

// Slug of the ruleset used by default for new lobbies.
// Maps to a YAML file in packages/shared/rulesets/ in a future module.
export const DEFAULT_RULESET_SLUG = 'classic';
