// Granular ban model. Each restriction is a string code stored in
// User.banRestrictions[]. Multiple can coexist; an empty array means no ban.
//
// Convention: codes are short snake_case strings, deliberately stable across
// versions because old DB rows must remain interpretable after a deploy. If
// you rename a code, write a migration.

export const BAN_RESTRICTION = {
  // Запрет на создание новых лобби (POST /lobby). Не трогает participation.
  CREATE_LOBBY: 'create_lobby',
  // Запрет на участие в играх — join lobby + auto-kick из активной игры.
  // Просмотр (если включён view_games) можно оставить, чтобы юзер видел что
  // происходит.
  PARTICIPATE_GAMES: 'participate_games',
  // Запрет на просмотр игр (GET /game/:id, спектатор-режим). Лобби-лист
  // в листинге всё ещё виден — это публичная информация.
  VIEW_GAMES: 'view_games',
  // Запрет на редактирование собственного профиля (никнейм, аватар,
  // clubName). Нужен когда юзер кладёт мат в свой ник/клуб.
  EDIT_PROFILE: 'edit_profile',
  // Полная блокировка сайта. /auth/me → 403; FE редиректит на banned-страницу.
  // Не комбинируется с остальными (включает их все).
  SITE_ACCESS: 'site_access',
} as const;

export type BanRestrictionCode = (typeof BAN_RESTRICTION)[keyof typeof BAN_RESTRICTION];

// Все коды — для итерации в UI чекбоксов и валидации.
export const ALL_BAN_RESTRICTIONS: readonly BanRestrictionCode[] = [
  BAN_RESTRICTION.CREATE_LOBBY,
  BAN_RESTRICTION.PARTICIPATE_GAMES,
  BAN_RESTRICTION.VIEW_GAMES,
  BAN_RESTRICTION.EDIT_PROFILE,
  BAN_RESTRICTION.SITE_ACCESS,
] as const;

export function isBanRestriction(value: string): value is BanRestrictionCode {
  return (ALL_BAN_RESTRICTIONS as readonly string[]).includes(value);
}
