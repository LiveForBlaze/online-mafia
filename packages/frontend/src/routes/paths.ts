// Single source of truth for client-side route paths.
// Using these constants instead of string literals catches typos at compile time
// and makes it easy to find every link to a given page across the codebase.

export const ROUTE_PATH = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  // Unified user page. Same route for owner (editable) and visitor (read-only) —
  // the page checks the `id` query param against the viewer's publicCode.
  USER: '/user',
  PLAYERS: '/players',
  CLUBS: '/clubs',
  TOURNAMENTS: '/tournaments',
  RULES: '/rules',
  ABOUT: '/about',
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

/** Build a user-profile URL from a user's public code. */
export function userProfilePath(code: string): string {
  return `/user?id=${encodeURIComponent(code)}`;
}
