// Game phases form the finite state machine of a single mafia game.
// The order below is the canonical flow, but the FSM may revisit phases
// (for example, multiple speeches per day, or revote/shootout after a tie).

export const GAME_PHASE = {
  // The lobby phase, before the game has begun. Players are joining.
  LOBBY: 'lobby',

  // Right after start: roles are dealt, players see their cards.
  ROLE_DISTRIBUTION: 'role_distribution',

  // The first night, when mafia and don see each other. No kills happen.
  NIGHT_ZERO: 'night_zero',

  // A player gives their speech during the day.
  DAY_SPEECH: 'day_speech',

  // Players who were nominated face open voting.
  DAY_VOTE: 'day_vote',

  // Revote in case of a tie after the first vote.
  DAY_REVOTE: 'day_revote',

  // Each tied player gives a short final speech, then the table decides to lift all or none.
  DAY_SHOOTOUT: 'day_shootout',

  // Voted-out player gives the final word.
  DAY_LAST_WORD: 'day_last_word',

  // Mafia chooses a target to shoot during the night.
  NIGHT_MAFIA: 'night_mafia',

  // Don checks one player to see whether they are the sheriff.
  NIGHT_DON: 'night_don',

  // Sheriff checks one player to learn whether they are mafia.
  NIGHT_SHERIFF: 'night_sheriff',

  // Morning announcement: who was killed in the night, gives last word.
  MORNING_ANNOUNCEMENT: 'morning_announcement',

  // The game has ended. The winner has been determined.
  GAME_OVER: 'game_over',
} as const;

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE];

// Phases that happen during the day. Useful for UI to render the day-time table layout.
export const DAY_PHASES: ReadonlyArray<GamePhase> = [
  GAME_PHASE.DAY_SPEECH,
  GAME_PHASE.DAY_VOTE,
  GAME_PHASE.DAY_REVOTE,
  GAME_PHASE.DAY_SHOOTOUT,
  GAME_PHASE.DAY_LAST_WORD,
];

// Phases that happen during the night. Useful for UI to dim everything and only show relevant roles.
export const NIGHT_PHASES: ReadonlyArray<GamePhase> = [
  GAME_PHASE.NIGHT_ZERO,
  GAME_PHASE.NIGHT_MAFIA,
  GAME_PHASE.NIGHT_DON,
  GAME_PHASE.NIGHT_SHERIFF,
];
