// Lobby module — business logic (barrel).
//
// All Prisma calls live here so routes stay thin. Each public operation returns a
// discriminated `Result<T>` instead of throwing for known business errors; this makes
// the route layer's translation to HTTP status codes mechanical and explicit.
//
// Concurrency: joinLobby uses a Serializable transaction so two players cannot grab
// the same seat. If the database detects a serialization conflict, we surface a clean
// `seat_contention` error and let the client retry.
//
// This file used to hold the whole lobby service. It has been split into cohesive
// sibling modules (lobby.service.internal / lobby.create / lobby.queries /
// lobby.membership / lobby.room / lobby.lifecycle); this barrel re-exports the public
// API so existing importers keep using './lobby.service.js'.

export type { ServiceSuccess, ServiceFailure, ServiceResult } from './lobby.service.internal.js';

export { createLobby } from './lobby.create.js';

export {
  listUserActiveLobbies,
  listLiveGames,
  listPublicLobbies,
  getLobbyDetails,
  getHomeStats,
  type HomeStats,
} from './lobby.queries.js';

export { joinLobby, leaveLobby, LOBBY_LIMITS } from './lobby.membership.js';

export { setReady, closeLobby, claimJudgeSeat, preassignRole, kickMember } from './lobby.room.js';

export {
  expireStaleLobbies,
  expireZombieGames,
  LOBBY_OPEN_TTL_MS,
  ZOMBIE_GAME_INACTIVITY_MS,
} from './lobby.lifecycle.js';
