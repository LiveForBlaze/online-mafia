import { z } from 'zod';

import { LOBBY, LOBBY_STATUS, MEMBER_ROLE } from '../constants/lobby.js';
import { GAME } from '../constants/game.js';

// ---- Inputs ----

const lobbyNameSchema = z.string().trim().min(LOBBY.NAME_MIN_LENGTH).max(LOBBY.NAME_MAX_LENGTH);

const lobbyPasswordSchema = z
  .string()
  .min(LOBBY.PASSWORD_MIN_LENGTH)
  .max(LOBBY.PASSWORD_MAX_LENGTH);

const memberRoleSchema = z.enum([MEMBER_ROLE.PLAYER, MEMBER_ROLE.JUDGE]);

// A private lobby always requires a password; a public one must not have one.
// .superRefine enforces this cross-field rule and keeps the error message specific.
export const createLobbyInputSchema = z
  .object({
    name: lobbyNameSchema,
    isPrivate: z.boolean(),
    password: lobbyPasswordSchema.optional(),
    hostRole: memberRoleSchema,
  })
  .superRefine((value, ctx) => {
    if (value.isPrivate && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password is required for private lobbies',
      });
    }
    if (!value.isPrivate && value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password is only allowed for private lobbies',
      });
    }
  });
export type CreateLobbyInput = z.infer<typeof createLobbyInputSchema>;

export const joinLobbyInputSchema = z.object({
  password: z.string().optional(),
  preferredRole: memberRoleSchema.optional(),
});
export type JoinLobbyInput = z.infer<typeof joinLobbyInputSchema>;

export const kickMemberInputSchema = z.object({
  userId: z.string().uuid(),
});
export type KickMemberInput = z.infer<typeof kickMemberInputSchema>;

// ---- Responses ----

export const lobbyMemberPublicSchema = z.object({
  userId: z.string().uuid(),
  nickname: z.string(),
  avatarUrl: z.string().url().nullable(),
  seat: z.number().int().min(GAME.FIRST_SEAT).max(GAME.LAST_SEAT).nullable(),
  isJudge: z.boolean(),
  isHost: z.boolean(),
  // True for auto-controlled test bots. The client renders a small bot badge.
  isBot: z.boolean(),
});
export type LobbyMemberPublic = z.infer<typeof lobbyMemberPublicSchema>;

export const lobbyStatusSchema = z.enum([
  LOBBY_STATUS.WAITING,
  LOBBY_STATUS.IN_GAME,
  LOBBY_STATUS.CLOSED,
]);

export const lobbySummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isPrivate: z.boolean(),
  hostId: z.string().uuid(),
  hostNickname: z.string(),
  rulesetSlug: z.string(),
  status: lobbyStatusSchema,
  memberCount: z.number().int().nonnegative(),
  maxMembers: z.number().int().positive(),
  createdAt: z.string().datetime(),
  // Populated once the lobby's game has been created. Clients use this to navigate
  // members to the game page when the host presses "Start".
  gameId: z.string().uuid().nullable(),
  // True if the requesting user is already a member of this lobby. The frontend uses
  // this to render "Continue" instead of "Join" and skip the join API call.
  isViewerMember: z.boolean(),
});
export type LobbySummary = z.infer<typeof lobbySummarySchema>;

export const lobbyDetailsSchema = lobbySummarySchema.extend({
  members: z.array(lobbyMemberPublicSchema),
});
export type LobbyDetails = z.infer<typeof lobbyDetailsSchema>;

export const lobbyListResponseSchema = z.object({
  lobbies: z.array(lobbySummarySchema),
});
export type LobbyListResponse = z.infer<typeof lobbyListResponseSchema>;

export const lobbyDetailsResponseSchema = z.object({
  lobby: lobbyDetailsSchema,
});
export type LobbyDetailsResponse = z.infer<typeof lobbyDetailsResponseSchema>;
