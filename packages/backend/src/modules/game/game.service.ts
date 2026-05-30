// Game service — orchestration layer (barrel).
//
// Service functions accept the current user, validate authorization, call into the
// pure engine for the actual state transformation, and persist a corresponding
// GameEvent row. They return a discriminated Result so callers (REST routes,
// Socket.IO gateway) can translate failures into the right error code.
//
// State of the in-flight game lives in the in-memory registry; the database is the
// authoritative history (event log) and the source of truth on reload.
//
// This file used to hold the whole orchestration layer. It has been split into
// cohesive sibling modules (game.service.internal / game.lifecycle / game.read /
// game.cleanup / game.role-distribution / game.actions); this barrel re-exports
// the public API so existing importers keep using './game.service.js'.

export { GAME_EVENT_TYPE, type ServiceResult } from './game.service.internal.js';

export { createGameFromLobby, findUserActiveGameId } from './game.lifecycle.js';

export { getProjectedStateFor, isParticipant, getGameLogForHost } from './game.read.js';

export {
  removeUserFromActiveGameForLobby,
  endActiveGameForLobby,
  leaveGameAsParticipant,
} from './game.cleanup.js';

export { schedulePickTimer, pickRoleCard } from './game.role-distribution.js';

export {
  nominatePlayer,
  judgeUnnominate,
  castVote,
  chooseMafiaTarget,
  checkAsDon,
  checkAsSheriff,
  judgeAdvancePhase,
  judgeAdvanceSpeaker,
  judgeIssueFoul,
  judgeRevert,
  judgeRevokeFoul,
  castLiftAllVote,
  castBestMoveGuess,
  sayOutOfTurn,
  judgeRemovePlayer,
} from './game.actions.js';
