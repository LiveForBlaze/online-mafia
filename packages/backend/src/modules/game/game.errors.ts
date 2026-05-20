// Game service-level error codes. Combine engine errors with orchestration errors.

import type { EngineErrorCode } from './game.engine.js';

export const GAME_ERROR = {
  GAME_NOT_FOUND: 'game_not_found',
  NOT_PARTICIPANT: 'not_participant',
  NOT_JUDGE: 'not_judge',
  LOBBY_NOT_FOUND: 'lobby_not_found',
  LOBBY_NOT_READY: 'lobby_not_ready',
  NOT_LOBBY_HOST: 'not_lobby_host',
  LOBBY_ALREADY_STARTED: 'lobby_already_started',
} as const;
export type GameErrorCode = (typeof GAME_ERROR)[keyof typeof GAME_ERROR] | EngineErrorCode;
