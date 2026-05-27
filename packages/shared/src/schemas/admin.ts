import { z } from 'zod';

import { BAN_RESTRICTION } from '../constants/admin.js';

// PATCH /admin/lobbies/:id — переименование. Имя не проходит AI-модерацию
// (админ знает, что делает).
export const adminRenameLobbyInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type AdminRenameLobbyInput = z.infer<typeof adminRenameLobbyInputSchema>;

// POST /admin/users/:id/restrictions — выставление ограничений целиком (set).
// Передача пустого массива = снятие бана.
export const adminSetRestrictionsInputSchema = z.object({
  restrictions: z.array(
    z.enum([
      BAN_RESTRICTION.CREATE_LOBBY,
      BAN_RESTRICTION.PARTICIPATE_GAMES,
      BAN_RESTRICTION.VIEW_GAMES,
      BAN_RESTRICTION.EDIT_PROFILE,
      BAN_RESTRICTION.SITE_ACCESS,
    ]),
  ),
  reason: z.string().trim().max(280).nullable().optional(),
});
export type AdminSetRestrictionsInput = z.infer<typeof adminSetRestrictionsInputSchema>;

// PATCH /admin/users/:id — переименование никнейма админом (модерацию обходит).
export const adminRenameUserInputSchema = z.object({
  nickname: z.string().trim().min(1).max(30),
});
export type AdminRenameUserInput = z.infer<typeof adminRenameUserInputSchema>;

// Что фронт получает в списке лобби-админки. Включает приватные поля
// (status, host, member counts) недоступные публичному /lobby.
export const adminLobbySummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(['WAITING', 'IN_GAME', 'CLOSED']),
  isPrivate: z.boolean(),
  hostId: z.string().uuid(),
  hostNickname: z.string(),
  hostEmail: z.string().email(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type AdminLobbySummary = z.infer<typeof adminLobbySummarySchema>;

export const adminLobbyListResponseSchema = z.object({
  lobbies: z.array(adminLobbySummarySchema),
  total: z.number().int().nonnegative(),
});
export type AdminLobbyListResponse = z.infer<typeof adminLobbyListResponseSchema>;

// Юзер в админ-списке. Раскрывает email и бан-статус.
export const adminUserSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  nickname: z.string(),
  publicCode: z.string(),
  isAdmin: z.boolean(),
  isBot: z.boolean(),
  banRestrictions: z.array(z.string()),
  bannedAt: z.string().datetime().nullable(),
  banReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

export const adminUserListResponseSchema = z.object({
  users: z.array(adminUserSummarySchema),
  total: z.number().int().nonnegative(),
});
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;
