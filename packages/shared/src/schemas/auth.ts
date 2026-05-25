import { z } from 'zod';

import { STANDARD_AVATARS } from '../constants/avatars.js';
import { emailSchema, nicknameSchema, passwordSchema } from './common.js';

// Payload for POST /api/v1/auth/register
export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nickname: nicknameSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

// Payload for PATCH /api/v1/auth/me/nickname
export const updateNicknameInputSchema = z.object({
  nickname: nicknameSchema,
});
export type UpdateNicknameInput = z.infer<typeof updateNicknameInputSchema>;

// Payload for PATCH /api/v1/auth/me/profile — optional public fields. Pass
// null in any field to clear it. Omitted fields are left untouched.
const optionalShortText = z.string().trim().max(80).nullable().optional();

// Только курируемый набор стандартных аватарок + null (без аватара).
// Раньше принимался также литерал 'google', но он убран: пользовательские
// фото из Google-аккаунтов как аватары больше не поддерживаются — это
// открывало путь к подделке reward-аватарок через подмену картинки на
// стороне Google. Аватарки должны нести смысл; для этого набор должен
// быть курируемым, а не «что угодно из вашего Google».
export const avatarIdSchema = z.enum(STANDARD_AVATARS).nullable().optional();

// Страна хранится как ISO 3166-1 alpha-2 код. Допускаем `null`/пусто
// (поле опционально). Не валидируем список здесь чтобы не таскать
// COUNTRIES в schemas — backend сам нормализует regex + uppercase.
const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'invalid_country_code')
  .nullable()
  .optional();

export const updateProfileInputSchema = z.object({
  realName: optionalShortText,
  country: countryCodeSchema,
  clubName: optionalShortText,
  avatarId: avatarIdSchema,
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

// Payload for POST /api/v1/auth/login
export const loginInputSchema = z.object({
  email: emailSchema,
  // We intentionally do not apply the strong passwordSchema rules here —
  // they belong to registration, not login (an old user may have an old-format password).
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

// Shape of the user object that the API returns to clients.
// Crucially, no passwordHash, no internal flags. Add new fields here when frontend needs them.
export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nickname: z.string(),
  publicCode: z.string(),
  avatarUrl: z.string().nullable(),
  // The user's cached Google photo URL (if they've ever signed in via Google).
  // Exposed only to the owner so the picker can offer "restore Google avatar".
  googleAvatarUrl: z.string().nullable(),
  realName: z.string().nullable(),
  country: z.string().nullable(),
  clubName: z.string().nullable(),
  hasPassword: z.boolean(),
  // Доставляем достижения в /me-ответе чтобы пикер аватаров мог сразу
  // показать какие slot'ы заблокированы / разблокированы. На публичном
  // профиле (PublicUserProfile) то же поле — расходимся только по типу
  // схемы; форма одинаковая, чтобы не плодить парсеров.
  achievements: z.array(z.object({ id: z.string(), earnedAt: z.string().datetime() })),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

// Wins broken down by the winning role. Sums to `wins`.
export const winsByRoleSchema = z.object({
  civilian: z.number().int().nonnegative().default(0),
  sheriff: z.number().int().nonnegative().default(0),
  mafia: z.number().int().nonnegative().default(0),
  don: z.number().int().nonnegative().default(0),
});
export type WinsByRole = z.infer<typeof winsByRoleSchema>;

// Получение записанного достижения. Каталог описаний живёт в
// shared/constants/achievements.ts, здесь — только факт получения.
export const earnedAchievementSchema = z.object({
  id: z.string(),
  earnedAt: z.string().datetime(),
});
export type EarnedAchievementPayload = z.infer<typeof earnedAchievementSchema>;

// Public profile — what /api/v1/users/:code returns. No email exposed.
export const publicUserProfileSchema = z.object({
  id: z.string().uuid(),
  publicCode: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  realName: z.string().nullable(),
  country: z.string().nullable(),
  clubName: z.string().nullable(),
  createdAt: z.string().datetime(),
  // Lifetime stats — incremented exactly once per finished game.
  gamesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  gamesAsJudge: z.number().int().nonnegative(),
  winsByRole: winsByRoleSchema,
  achievements: z.array(earnedAchievementSchema),
});
export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;

export const publicUserProfileResponseSchema = z.object({
  user: publicUserProfileSchema,
});
export type PublicUserProfileResponse = z.infer<typeof publicUserProfileResponseSchema>;

// Список игроков (директория). Ответ paginated, фильтр по nickname.
export const publicUserListResponseSchema = z.object({
  users: z.array(publicUserProfileSchema),
  total: z.number().int().nonnegative(),
});
export type PublicUserListResponse = z.infer<typeof publicUserListResponseSchema>;

// Payload for DELETE /api/v1/auth/me. The user must retype their email to
// confirm and — if they have a password — re-enter it. Google-only users
// without a local password skip the password field; for them the email
// retype + valid session is the only confirmation. The server enforces the
// rules; client-side validation is a UX nicety.
export const deleteAccountInputSchema = z.object({
  confirmEmail: z.string().email(),
  password: z.string().min(1).max(256).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

// Response of any auth endpoint that establishes a session.
export const authSessionResponseSchema = z.object({
  user: authenticatedUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
