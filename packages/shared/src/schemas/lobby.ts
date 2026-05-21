import { z } from 'zod';

import { LOBBY, LOBBY_STATUS, MEMBER_ROLE } from '../constants/lobby.js';
import { GAME } from '../constants/game.js';
import { ROLE } from '../constants/roles.js';

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

// Payload for POST /api/v1/lobby/:id/preassign-role.
// `role: null` clears any prior pre-assignment for that user.
export const preassignRoleInputSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum([ROLE.CIVILIAN, ROLE.SHERIFF, ROLE.MAFIA, ROLE.DON]).nullable(),
});
export type PreassignRoleInput = z.infer<typeof preassignRoleInputSchema>;

// ---- Responses ----

export const lobbyMemberPublicSchema = z.object({
  userId: z.string().uuid(),
  nickname: z.string(),
  // Public profile code so the UI can deep-link to /u/:code. Optional for
  // backwards compatibility with older payloads (e.g. bot rows pre-migration).
  publicCode: z.string().optional(),
  avatarUrl: z.string().url().nullable(),
  seat: z.number().int().min(GAME.FIRST_SEAT).max(GAME.LAST_SEAT).nullable(),
  isJudge: z.boolean(),
  isHost: z.boolean(),
  // True for auto-controlled test bots. The client renders a small bot badge.
  isBot: z.boolean(),
  // Host-only dev/test affordance: a role the host has pre-assigned to this
  // seat. The engine honors it on game start instead of randomizing. Only
  // populated in responses sent to the host — null for everyone else.
  preassignedRole: z.enum([ROLE.CIVILIAN, ROLE.SHERIFF, ROLE.MAFIA, ROLE.DON]).nullable(),
});
export type LobbyMemberPublic = z.infer<typeof lobbyMemberPublicSchema>;

// ---- Chat ----

// Hard cap on a single chat message. Generous enough for a normal sentence;
// tight enough that no one is going to paste a wall of text into pre-game.
export const LOBBY_CHAT_MAX_LENGTH = 500;

// Server → client: a chat message that was just broadcast to the lobby room.
export const lobbyChatMessageSchema = z.object({
  id: z.string(),
  lobbyId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  fromNickname: z.string(),
  fromPublicCode: z.string().optional(),
  text: z.string().min(1).max(LOBBY_CHAT_MAX_LENGTH),
  // ISO datetime for ordering / display.
  sentAt: z.string().datetime(),
});
export type LobbyChatMessage = z.infer<typeof lobbyChatMessageSchema>;

// Client → server: send a new chat message into the lobby room.
export const lobbyChatSendPayloadSchema = z.object({
  lobbyId: z.string().uuid(),
  text: z.string().trim().min(1).max(LOBBY_CHAT_MAX_LENGTH),
});
export type LobbyChatSendPayload = z.infer<typeof lobbyChatSendPayloadSchema>;

// Wrapper used when the server pushes the message back to subscribers.
export const lobbyChatBroadcastSchema = z.object({
  message: lobbyChatMessageSchema,
});
export type LobbyChatBroadcast = z.infer<typeof lobbyChatBroadcastSchema>;

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
  // Public profile code of the host, so the lobby card can link the host name
  // to /u/:code. Optional for backwards compatibility with older payloads.
  hostPublicCode: z.string().optional(),
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
