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
  avatarUrl: z.string().url().nullable(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

// Response of any auth endpoint that establishes a session.
export const authSessionResponseSchema = z.object({
  user: authenticatedUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
