// Standard avatar set. IDs are stored directly in the avatarUrl column.
// Real image files live at /avatars/{id}.jpg on the frontend static server.
// Use isStandardAvatar() to distinguish them from external URLs (Google, etc.).

// Базовые аватары — доступны всем. Если расширяешь список, нумерация
// продолжается естественно (avatar-11, avatar-12, …). Экспорт нужен для
// UI-категоризации в пикере (вкладка «Стандартные»).
export const COMMON_AVATARS = [
  'avatar-01',
  'avatar-02',
  'avatar-03',
  'avatar-04',
  'avatar-05',
  'avatar-06',
  'avatar-07',
  'avatar-08',
  'avatar-09',
  'avatar-10',
] as const;

// Locked-под-достижение аватары. Сервер проверяет в updateProfile, что у
// юзера есть нужное достижение, прежде чем сохранить такой avatarId. UI
// показывает их в пикере, но не даёт нажать без бейджа.
//
// Key — id ачивки из shared/constants/achievements.ts. Value — список
// аватарок, открываемых этой ачивкой.
export const AVATARS_BY_ACHIEVEMENT = {
  alpha_tester: ['avatar-alpha-m', 'avatar-alpha-f'],
} as const;

// Плоский список аватарок-наград для быстрого lookup'а и для UI-категории
// «Наградные» в пикере.
export const REWARD_AVATARS = Object.values(AVATARS_BY_ACHIEVEMENT).flat();

export const STANDARD_AVATARS = [...COMMON_AVATARS, ...REWARD_AVATARS] as const;

export type StandardAvatarId = (typeof STANDARD_AVATARS)[number];

export function isStandardAvatar(value: string | null | undefined): value is StandardAvatarId {
  return STANDARD_AVATARS.includes(value as StandardAvatarId);
}

/**
 * Если аватар заблокирован достижением — вернуть id того достижения. Иначе null.
 * Сервер использует это в updateProfile для проверки прав на выбор.
 */
export function requiredAchievementForAvatar(avatarId: string): string | null {
  for (const [achievementId, avatars] of Object.entries(AVATARS_BY_ACHIEVEMENT)) {
    if ((avatars as readonly string[]).includes(avatarId)) return achievementId;
  }
  return null;
}
