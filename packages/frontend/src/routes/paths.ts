// Single source of truth for client-side route paths.
// Using these constants instead of string literals catches typos at compile time
// and makes it easy to find every link to a given page across the codebase.

export const ROUTE_PATH = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  PROFILE: '/profile',
  LOBBY_ROOM: '/lobby/:id',
  GAME_ROOM: '/game/:id',
} as const;

/** Build a concrete lobby room URL from a lobby id. */
export function lobbyRoomPath(lobbyId: string): string {
  return `/lobby/${lobbyId}`;
}

/** Build a concrete game URL from a game id. */
export function gameRoomPath(gameId: string): string {
  return `/game/${gameId}`;
}
