// Standard avatar set. IDs are stored directly in the avatarUrl column.
// Real image files live at /avatars/{id}.png on the frontend static server.
// Use isStandardAvatar() to distinguish them from external URLs (Google, etc.).

export const STANDARD_AVATARS = [
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

export type StandardAvatarId = (typeof STANDARD_AVATARS)[number];

export function isStandardAvatar(value: string | null | undefined): value is StandardAvatarId {
  return STANDARD_AVATARS.includes(value as StandardAvatarId);
}
