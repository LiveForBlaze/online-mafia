import { z } from 'zod';

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
export const updateProfileInputSchema = z.object({
  realName: optionalShortText,
  country: optionalShortText,
  clubName: optionalShortText,
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
  avatarUrl: z.string().url().nullable(),
  realName: z.string().nullable(),
  country: z.string().nullable(),
  clubName: z.string().nullable(),
  // Whether the user has a local password (vs Google-only). Used by the
  // delete-account dialog to decide whether to show the password field.
  hasPassword: z.boolean(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

// Public profile — what /api/v1/users/:code returns. No email exposed.
export const publicUserProfileSchema = z.object({
  id: z.string().uuid(),
  publicCode: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().url().nullable(),
  realName: z.string().nullable(),
  country: z.string().nullable(),
  clubName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;

export const publicUserProfileResponseSchema = z.object({
  user: publicUserProfileSchema,
});
export type PublicUserProfileResponse = z.infer<typeof publicUserProfileResponseSchema>;

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
