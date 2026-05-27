import { z } from 'zod';

import { CLUB_NAME_MAX, CLUB_NAME_MIN } from '../constants/clubs.js';

export const clubNameSchema = z.string().trim().min(CLUB_NAME_MIN).max(CLUB_NAME_MAX);

export const createClubInputSchema = z.object({
  name: clubNameSchema,
});
export type CreateClubInput = z.infer<typeof createClubInputSchema>;

export const renameClubInputSchema = z.object({
  name: clubNameSchema,
});
export type RenameClubInput = z.infer<typeof renameClubInputSchema>;

export const transferLeadershipInputSchema = z.object({
  newHeadId: z.string().uuid(),
});
export type TransferLeadershipInput = z.infer<typeof transferLeadershipInputSchema>;

export const approveJoinInputSchema = z.object({
  userId: z.string().uuid(),
});
export type ApproveJoinInput = z.infer<typeof approveJoinInputSchema>;

export const setPrimaryClubInputSchema = z.object({
  clubId: z.string().uuid().nullable(),
});
export type SetPrimaryClubInput = z.infer<typeof setPrimaryClubInputSchema>;

// ---- Response shapes (used by both BE serialization and FE consumers) ----

export const clubSummarySchema = z.object({
  id: z.string().uuid(),
  publicCode: z.string(),
  name: z.string(),
  memberCount: z.number().int().nonnegative(),
  headNickname: z.string(),
  // viewer's relationship to this club. Computed server-side per request.
  viewerStatus: z.enum(['none', 'pending', 'member', 'head']),
});
export type ClubSummary = z.infer<typeof clubSummarySchema>;

export const clubListResponseSchema = z.object({
  clubs: z.array(clubSummarySchema),
  total: z.number().int().nonnegative(),
});
export type ClubListResponse = z.infer<typeof clubListResponseSchema>;

export const clubMemberSchema = z.object({
  userId: z.string().uuid(),
  nickname: z.string(),
  publicCode: z.string(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.string().datetime(),
  isHead: z.boolean(),
});
export type ClubMember = z.infer<typeof clubMemberSchema>;

export const clubJoinRequestSchema = z.object({
  userId: z.string().uuid(),
  nickname: z.string(),
  publicCode: z.string(),
  avatarUrl: z.string().nullable(),
  requestedAt: z.string().datetime(),
});
export type ClubJoinRequest = z.infer<typeof clubJoinRequestSchema>;

export const clubDetailsSchema = z.object({
  id: z.string().uuid(),
  publicCode: z.string(),
  name: z.string(),
  headId: z.string().uuid(),
  createdAt: z.string().datetime(),
  members: z.array(clubMemberSchema),
  // Only populated when viewer === head. Empty array otherwise.
  joinRequests: z.array(clubJoinRequestSchema),
  viewerStatus: z.enum(['none', 'pending', 'member', 'head']),
});
export type ClubDetails = z.infer<typeof clubDetailsSchema>;

export const clubDetailsResponseSchema = z.object({
  club: clubDetailsSchema,
});
export type ClubDetailsResponse = z.infer<typeof clubDetailsResponseSchema>;
