// Names of WebSocket / Socket.IO events exchanged between client and server.
// Server-emitted events use the prefix `server:`, client-emitted use `client:`.
// All payloads are validated with zod schemas (see ../schemas/).

export const SERVER_EVENT = {
  // Connection lifecycle
  CONNECTED: 'server:connected',
  ERROR: 'server:error',

  // Lobby
  LOBBY_UPDATED: 'server:lobby_updated',
  LOBBY_PLAYER_JOINED: 'server:lobby_player_joined',
  LOBBY_PLAYER_LEFT: 'server:lobby_player_left',

  // Game lifecycle
  GAME_STARTED: 'server:game_started',
  GAME_PHASE_CHANGED: 'server:game_phase_changed',
  GAME_STATE_DELTA: 'server:game_state_delta',
  GAME_ENDED: 'server:game_ended',

  // Game per-player events
  ROLE_ASSIGNED: 'server:role_assigned',
  PLAYER_KILLED: 'server:player_killed',
  PLAYER_VOTED: 'server:player_voted',
  CHECK_RESULT: 'server:check_result',

  // Judge actions visible to all players
  FOUL_ISSUED: 'server:foul_issued',
  PLAYER_REMOVED: 'server:player_removed',
} as const;

export type ServerEventName = (typeof SERVER_EVENT)[keyof typeof SERVER_EVENT];

export const CLIENT_EVENT = {
  // Auth
  AUTHENTICATE: 'client:authenticate',

  // Lobby
  LOBBY_JOIN: 'client:lobby_join',
  LOBBY_LEAVE: 'client:lobby_leave',
  LOBBY_START_GAME: 'client:lobby_start_game',

  // Game actions by players
  CAST_VOTE: 'client:cast_vote',
  NOMINATE_PLAYER: 'client:nominate_player',
  MAFIA_TARGET: 'client:mafia_target',
  DON_CHECK: 'client:don_check',
  SHERIFF_CHECK: 'client:sheriff_check',

  // Judge actions
  JUDGE_ADVANCE_PHASE: 'client:judge_advance_phase',
  JUDGE_ISSUE_FOUL: 'client:judge_issue_foul',
  JUDGE_REMOVE_PLAYER: 'client:judge_remove_player',

  // Self-removal — the player explicitly leaves the game (red button).
  // Distinct from closing the tab, which is treated as a reconnectable absence.
  LEAVE_GAME: 'client:leave_game',
} as const;

export type ClientEventName = (typeof CLIENT_EVENT)[keyof typeof CLIENT_EVENT];
