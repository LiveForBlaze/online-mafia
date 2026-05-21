import { z } from 'zod';

import { GAME_PHASE, type GamePhase } from '../constants/phases.js';
import { ROLE, TEAM, type Role, type Team } from '../constants/roles.js';

// ---- Client → Server action payloads ----

const seatNumberSchema = z.number().int().min(1).max(10);
const userIdSchema = z.string().uuid();

export const nominatePayloadSchema = z.object({
  targetSeat: seatNumberSchema,
});
export type NominatePayload = z.infer<typeof nominatePayloadSchema>;

export const castVotePayloadSchema = z.object({
  candidateSeat: seatNumberSchema,
});
export type CastVotePayload = z.infer<typeof castVotePayloadSchema>;

export const mafiaTargetPayloadSchema = z.object({
  targetSeat: seatNumberSchema,
});
export type MafiaTargetPayload = z.infer<typeof mafiaTargetPayloadSchema>;

export const donCheckPayloadSchema = z.object({
  targetSeat: seatNumberSchema,
});
export type DonCheckPayload = z.infer<typeof donCheckPayloadSchema>;

export const sheriffCheckPayloadSchema = z.object({
  targetSeat: seatNumberSchema,
});
export type SheriffCheckPayload = z.infer<typeof sheriffCheckPayloadSchema>;

export const judgeFoulPayloadSchema = z.object({
  targetUserId: userIdSchema,
});
export type JudgeFoulPayload = z.infer<typeof judgeFoulPayloadSchema>;

export const judgeRemovePayloadSchema = z.object({
  targetUserId: userIdSchema,
});
export type JudgeRemovePayload = z.infer<typeof judgeRemovePayloadSchema>;

// Judge advances the phase; the engine decides what the next phase is.
export const judgeAdvancePayloadSchema = z.object({}).optional();

// ---- Projected game state (sent server → client) ----
//
// The server holds the full state — including everyone's role — but each client receives
// a tailored projection: roles, night-action targets, and check results are only included
// when the recipient is allowed to know about them. See projectFor() on the server.

export const gameStatusSchema = z.enum(['in_progress', 'finished']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

export const teamSchema = z.enum([TEAM.RED, TEAM.BLACK]);
export const roleSchema = z.enum([ROLE.CIVILIAN, ROLE.SHERIFF, ROLE.MAFIA, ROLE.DON]);
export const phaseSchema = z.enum([
  GAME_PHASE.LOBBY,
  GAME_PHASE.ROLE_DISTRIBUTION,
  GAME_PHASE.NIGHT_ZERO,
  GAME_PHASE.DAY_SPEECH,
  GAME_PHASE.DAY_VOTE,
  GAME_PHASE.DAY_REVOTE,
  GAME_PHASE.DAY_SHOOTOUT,
  GAME_PHASE.DAY_LAST_WORD,
  GAME_PHASE.NIGHT_MAFIA,
  GAME_PHASE.NIGHT_DON,
  GAME_PHASE.NIGHT_SHERIFF,
  GAME_PHASE.MORNING_ANNOUNCEMENT,
  GAME_PHASE.GAME_OVER,
]);

export const gameParticipantPublicSchema = z.object({
  userId: userIdSchema,
  nickname: z.string(),
  avatarUrl: z.string().url().nullable(),
  seat: z.number().int().nullable(),
  isJudge: z.boolean(),
  // True for auto-controlled test bots.
  isBot: z.boolean(),
  // null when the viewer should not know this player's role.
  role: roleSchema.nullable(),
  isAlive: z.boolean(),
  isRemoved: z.boolean(),
  foulsCount: z.number().int().nonnegative(),
  // True while it is this player's turn to speak.
  hasSpokenThisDay: z.boolean(),
});
export type GameParticipantPublic = z.infer<typeof gameParticipantPublicSchema>;

export const personalCheckResultSchema = z
  .object({
    targetSeat: z.number().int(),
    // True if the checked player was mafia (sheriff) or sheriff (don).
    result: z.boolean(),
  })
  .nullable();
export type PersonalCheckResult = z.infer<typeof personalCheckResultSchema>;

export const gameStateProjectedSchema = z.object({
  id: z.string().uuid(),
  lobbyId: z.string().uuid(),
  rulesetSlug: z.string(),
  status: gameStatusSchema,

  phase: phaseSchema,
  dayNumber: z.number().int().nonnegative(),

  // ISO timestamps describing the current phase / speaker countdown.
  // Both are null when the current phase has no timer (lobby, game_over).
  phaseStartedAt: z.string().datetime().nullable(),
  phaseDeadline: z.string().datetime().nullable(),

  participants: z.array(gameParticipantPublicSchema),

  // Whose turn to speak right now (null outside day_speech phase).
  currentSpeakerSeat: z.number().int().nullable(),
  // Seats nominated for elimination this day.
  nominationSeats: z.array(z.number().int()),
  // Map of voter seat → candidate seat for the current vote.
  votes: z.record(z.string(), z.number().int()),

  // Latest mafia target chosen this night.
  // Visible to mafia, don, judge during night; visible to everyone after morning announcement.
  pendingMafiaTargetSeat: z.number().int().nullable(),
  // The player killed last night (announced during morning_announcement).
  lastNightVictimSeat: z.number().int().nullable(),

  // Check result for the current viewer (sheriff or don). Null otherwise.
  myCheckResult: personalCheckResultSchema,

  // 5-second audibility window opened by a player who pressed "Сказать под фол".
  // Clients use this to render that player's audio even outside their normal turn.
  outOfTurnSpeaker: z
    .object({
      userId: z.string().uuid(),
      until: z.number().int(),
    })
    .nullable(),

  // Seat of the player giving their farewell minute (last word from the
  // grave). Set at the start of day N+1 when the player was killed at
  // night N. Cleared once their minute ends and the regular speech round
  // begins. Their audio is allowed even though they're dead.
  farewellSeat: z.number().int().nullable(),

  // Filled in once the game ends.
  winner: teamSchema.nullable(),
});
export type GameStateProjected = z.infer<typeof gameStateProjectedSchema>;

// Response shape of POST /api/v1/game/:id/livekit-token.
export const liveKitTokenResponseSchema = z.object({
  token: z.string().min(1),
  url: z.string().url(),
  roomName: z.string().min(1),
});
export type LiveKitTokenResponse = z.infer<typeof liveKitTokenResponseSchema>;

// Re-export referenced types for convenience.
export type { GamePhase, Role, Team };
