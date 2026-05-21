// Error codes the lobby service returns. Routes map each code to an HTTP status.
// Codes are deliberately short, lowercase, and stable — clients may show localized
// messages keyed by these strings (see frontend's lobby messages.ts).

export const LOBBY_ERROR = {
  NOT_FOUND: 'lobby_not_found',
  NOT_OPEN: 'lobby_not_open',
  FULL: 'lobby_full',
  JUDGE_SLOT_TAKEN: 'judge_slot_taken',
  ALREADY_MEMBER: 'already_member',
  NOT_MEMBER: 'not_member',
  NOT_HOST: 'not_host',
  PASSWORD_REQUIRED: 'password_required',
  WRONG_PASSWORD: 'wrong_password',
  TARGET_NOT_FOUND: 'target_not_found',
  CANNOT_KICK_HOST: 'cannot_kick_host',
  SEAT_CONTENTION: 'seat_contention',
  ROLE_CAP_REACHED: 'role_cap_reached',
  NAME_REJECTED: 'lobby_name_rejected',
} as const;

export type LobbyErrorCode = (typeof LOBBY_ERROR)[keyof typeof LOBBY_ERROR];
