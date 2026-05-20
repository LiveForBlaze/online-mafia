// Lobby module — business logic.
//
// All Prisma calls live here so routes stay thin. Each public operation returns a
// discriminated `Result<T>` instead of throwing for known business errors; this makes
// the route layer's translation to HTTP status codes mechanical and explicit.
//
// Concurrency: joinLobby uses a Serializable transaction so two players cannot grab
// the same seat. If the database detects a serialization conflict, we surface a clean
// `seat_contention` error and let the client retry.

import { Prisma, type LobbyMember } from '@prisma/client';
import {
  DEFAULT_RULESET_SLUG,
  GAME,
  LOBBY,
  MEMBER_ROLE,
  type CreateLobbyInput,
  type JoinLobbyInput,
  type LobbyDetails,
  type LobbySummary,
  type MemberRole,
} from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

import { LOBBY_ERROR, type LobbyErrorCode } from './lobby.errors.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { toLobbyDetails, toLobbySummary } from './lobby.mappers.js';

// ---- Result types ----

export interface ServiceSuccess<T> {
  ok: true;
  data: T;
}
export interface ServiceFailure {
  ok: false;
  error: LobbyErrorCode;
}
export type ServiceResult<T> = ServiceSuccess<T> | ServiceFailure;

const ok = <T>(data: T): ServiceSuccess<T> => ({ ok: true, data });
const fail = (error: LobbyErrorCode): ServiceFailure => ({ ok: false, error });

// ---- Public API ----

export async function createLobby(
  hostId: string,
  input: CreateLobbyInput,
): Promise<ServiceResult<LobbyDetails>> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const hostAsJudge = input.hostRole === MEMBER_ROLE.JUDGE;

  const lobby = await prisma.lobby.create({
    data: {
      name: input.name,
      isPrivate: input.isPrivate,
      passwordHash,
      hostId,
      rulesetSlug: DEFAULT_RULESET_SLUG,
      members: {
        create: {
          userId: hostId,
          seat: hostAsJudge ? null : GAME.FIRST_SEAT,
          isJudge: hostAsJudge,
        },
      },
    },
    include: {
      host: { select: { id: true, nickname: true } },
      game: { select: { id: true } },
      members: {
        include: { user: { select: { id: true, nickname: true, avatarUrl: true, isBot: true } } },
        orderBy: [{ isJudge: 'desc' }, { seat: 'asc' }],
      },
    },
  });

  void broadcastLobbyUpdate(lobby.id);
  return ok(toLobbyDetails(lobby, hostId));
}

// Lobbies that the viewer is a member of and whose game is in progress.
// Used to render the "active games" section on the lobby list page so a host
// who navigates away from an in-progress game can find their way back.
export async function listUserActiveLobbies(viewerUserId: string): Promise<LobbySummary[]> {
  const rows = await prisma.lobby.findMany({
    where: {
      status: 'IN_GAME',
      members: { some: { userId: viewerUserId } },
    },
    include: {
      host: { select: { id: true, nickname: true } },
      game: { select: { id: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, true));
}

export async function listPublicLobbies(viewerUserId: string): Promise<LobbySummary[]> {
  // Fetch the `members` relation filtered to the viewer's row only — that way we know
  // membership per lobby without loading every member in the result set.
  const rows = await prisma.lobby.findMany({
    where: {
      isPrivate: false,
      status: 'WAITING',
    },
    include: {
      host: { select: { id: true, nickname: true } },
      game: { select: { id: true } },
      _count: { select: { members: true } },
      members: {
        where: { userId: viewerUserId },
        select: { userId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, row.members.length > 0));
}

export async function getLobbyDetails(
  lobbyId: string,
  viewerUserId: string,
): Promise<ServiceResult<LobbyDetails>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      host: { select: { id: true, nickname: true } },
      game: { select: { id: true } },
      members: {
        include: { user: { select: { id: true, nickname: true, avatarUrl: true, isBot: true } } },
        orderBy: [{ isJudge: 'desc' }, { seat: 'asc' }],
      },
    },
  });

  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  return ok(toLobbyDetails(lobby, viewerUserId));
}

export async function joinLobby(
  lobbyId: string,
  userId: string,
  input: JoinLobbyInput,
): Promise<ServiceResult<LobbyDetails>> {
  // We need to atomically: read members, compute next seat, insert.
  // Postgres Serializable isolation detects conflicting concurrent transactions.
  try {
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      select: {
        id: true,
        status: true,
        isPrivate: true,
        passwordHash: true,
      },
    });
    if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
    if (lobby.status !== 'WAITING') return fail(LOBBY_ERROR.NOT_OPEN);

    if (lobby.isPrivate) {
      if (!input.password) return fail(LOBBY_ERROR.PASSWORD_REQUIRED);
      if (!lobby.passwordHash) return fail(LOBBY_ERROR.WRONG_PASSWORD);
      const passwordOk = await verifyPassword(lobby.passwordHash, input.password);
      if (!passwordOk) return fail(LOBBY_ERROR.WRONG_PASSWORD);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.lobbyMember.findUnique({
          where: { lobbyId_userId: { lobbyId, userId } },
        });
        if (existing) return { kind: 'error' as const, error: LOBBY_ERROR.ALREADY_MEMBER };

        const members = await tx.lobbyMember.findMany({
          where: { lobbyId },
          select: { seat: true, isJudge: true },
        });

        const placement = pickPlacement(members, input.preferredRole);
        if (placement.kind === 'error') return placement;

        await tx.lobbyMember.create({
          data: {
            lobbyId,
            userId,
            seat: placement.seat,
            isJudge: placement.isJudge,
          },
        });

        return { kind: 'ok' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind === 'error') return fail(result.error);
  } catch (error) {
    if (isSerializationFailure(error)) return fail(LOBBY_ERROR.SEAT_CONTENTION);
    if (isUniqueConstraintViolation(error)) return fail(LOBBY_ERROR.SEAT_CONTENTION);
    throw error;
  }

  // Notify every socket in the lobby room about the new member.
  void broadcastLobbyUpdate(lobbyId);
  return getLobbyDetails(lobbyId, userId);
}

export async function leaveLobby(
  lobbyId: string,
  userId: string,
): Promise<ServiceResult<{ closed: boolean }>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: { members: { select: { userId: true } } },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);

  const isMember = lobby.members.some((m) => m.userId === userId);
  if (!isMember) return fail(LOBBY_ERROR.NOT_MEMBER);

  // The host IS the judge of the lobby — the role can't be reassigned. When the
  // host leaves, the entire lobby is closed for everyone. Regular players just
  // get removed from their seat.
  if (lobby.hostId === userId) {
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: { status: 'CLOSED' },
    });
    void broadcastLobbyUpdate(lobbyId);
    return ok({ closed: true });
  }

  await prisma.lobbyMember.delete({ where: { lobbyId_userId: { lobbyId, userId } } });
  void broadcastLobbyUpdate(lobbyId);
  return ok({ closed: false });
}

export async function closeLobby(
  lobbyId: string,
  userId: string,
): Promise<ServiceResult<{ closed: true }>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { id: true, hostId: true },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  if (lobby.hostId !== userId) return fail(LOBBY_ERROR.NOT_HOST);

  await prisma.lobby.update({
    where: { id: lobbyId },
    data: { status: 'CLOSED' },
  });
  void broadcastLobbyUpdate(lobbyId);
  return ok({ closed: true });
}

// Switch the caller from their current seat to the judge slot. Only works when
// the judge slot is empty. Used by hosts who realized too late that no one
// claimed the judge role.
export async function claimJudgeSeat(
  lobbyId: string,
  userId: string,
): Promise<ServiceResult<LobbyDetails>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      status: true,
      members: { select: { userId: true, isJudge: true } },
    },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  if (lobby.status !== 'WAITING') return fail(LOBBY_ERROR.NOT_OPEN);

  const me = lobby.members.find((m) => m.userId === userId);
  if (!me) return fail(LOBBY_ERROR.NOT_MEMBER);
  if (me.isJudge) return getLobbyDetails(lobbyId, userId);

  const judgeTaken = lobby.members.some((m) => m.isJudge);
  if (judgeTaken) return fail(LOBBY_ERROR.JUDGE_SLOT_TAKEN);

  await prisma.lobbyMember.update({
    where: { lobbyId_userId: { lobbyId, userId } },
    data: { seat: null, isJudge: true },
  });

  void broadcastLobbyUpdate(lobbyId);
  return getLobbyDetails(lobbyId, userId);
}

export async function kickMember(
  lobbyId: string,
  hostUserId: string,
  targetUserId: string,
): Promise<ServiceResult<LobbyDetails>> {
  if (hostUserId === targetUserId) return fail(LOBBY_ERROR.CANNOT_KICK_HOST);

  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { id: true, hostId: true },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  if (lobby.hostId !== hostUserId) return fail(LOBBY_ERROR.NOT_HOST);

  const target = await prisma.lobbyMember.findUnique({
    where: { lobbyId_userId: { lobbyId, userId: targetUserId } },
  });
  if (!target) return fail(LOBBY_ERROR.TARGET_NOT_FOUND);

  await prisma.lobbyMember.delete({
    where: { lobbyId_userId: { lobbyId, userId: targetUserId } },
  });

  void broadcastLobbyUpdate(lobbyId);
  return getLobbyDetails(lobbyId, hostUserId);
}

// ---- Helpers ----

/**
 * Decide whether the joining user becomes the judge or takes a player seat.
 * Preference rules:
 *   - If the caller asked for judge: they get it if the judge slot is empty, else error.
 *   - If the caller asked for player (or did not specify): take the lowest empty seat.
 *     If all seats are taken but the judge slot is empty, do NOT silently make them judge —
 *     the user explicitly wanted to play.
 */
function pickPlacement(
  members: Pick<LobbyMember, 'seat' | 'isJudge'>[],
  preferred: MemberRole | undefined,
):
  | { kind: 'ok'; seat: number | null; isJudge: boolean }
  | { kind: 'error'; error: LobbyErrorCode } {
  const judgeTaken = members.some((m) => m.isJudge);
  const takenSeats = new Set(
    members.filter((m) => !m.isJudge && m.seat !== null).map((m) => m.seat as number),
  );

  if (preferred === MEMBER_ROLE.JUDGE) {
    if (judgeTaken) return { kind: 'error', error: LOBBY_ERROR.JUDGE_SLOT_TAKEN };
    return { kind: 'ok', seat: null, isJudge: true };
  }

  for (let seat = GAME.FIRST_SEAT; seat <= GAME.LAST_SEAT; seat += 1) {
    if (!takenSeats.has(seat)) {
      return { kind: 'ok', seat, isJudge: false };
    }
  }

  return { kind: 'error', error: LOBBY_ERROR.FULL };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isSerializationFailure(error: unknown): boolean {
  // Postgres SQLSTATE 40001 — serialization failure detected by the database.
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || (error.meta as { code?: string } | undefined)?.code === '40001')
  );
}

// Re-export the LOBBY_MAX_MEMBERS limit for routes that need it.
export const LOBBY_LIMITS = {
  MAX_MEMBERS: LOBBY.MAX_MEMBERS,
} as const;
