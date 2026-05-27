// Club business rules and error codes shared between backend and frontend.

export const CLUB_NAME_MIN = 2;
export const CLUB_NAME_MAX = 40;

// Юзер может одновременно состоять не более чем в N клубах. Pending заявки
// в счёт не идут — лимит на активные membership rows. См. service-layer
// проверки в createClub / submitJoinRequest / approveJoinRequest.
export const MAX_CLUBS_PER_USER = 3;

export const CLUB_ERROR = {
  NOT_FOUND: 'club_not_found',
  NAME_TAKEN: 'club_name_taken',
  NAME_REJECTED: 'club_name_rejected',
  NOT_MEMBER: 'not_member',
  NOT_HEAD: 'not_head',
  NOT_PENDING: 'not_pending',
  ALREADY_MEMBER: 'already_member',
  ALREADY_PENDING: 'already_pending',
  TARGET_NOT_MEMBER: 'target_not_member',
  CANNOT_KICK_HEAD: 'cannot_kick_head',
  // Самому юзеру нельзя ещё в один клуб — он уже в MAX_CLUBS_PER_USER.
  MAX_CLUBS_REACHED: 'max_clubs_reached',
  // Голова одобряет заявку, но target уже в MAX_CLUBS_PER_USER клубах
  // (накинул заявок и часть других одобрили раньше). Сообщаем главе что
  // approve бесполезен.
  TARGET_MAX_CLUBS_REACHED: 'target_max_clubs_reached',
} as const;
export type ClubErrorCode = (typeof CLUB_ERROR)[keyof typeof CLUB_ERROR];
