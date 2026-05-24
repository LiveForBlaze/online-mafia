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
import { moderateName } from '../../lib/moderation.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { endActiveGameForLobby, removeUserFromActiveGameForLobby } from '../game/game.service.js';

import { LOBBY_ERROR, type LobbyErrorCode } from './lobby.errors.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { clearLobbyChat } from './lobby.chat.js';
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
  // AI-moderate the name before we touch the DB. Cheap (~$0.0003 per call) and
  // fails open if the moderation service is down — see lib/moderation.ts.
  const verdict = await moderateName(input.name, 'lobby');
  if (!verdict.allowed) {
    return fail(LOBBY_ERROR.NAME_REJECTED);
  }

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
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      members: {
        include: {
          user: {
            select: { id: true, nickname: true, publicCode: true, avatarUrl: true, isBot: true },
          },
        },
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
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      // Подсчитываем только игроков (без судьи) — счётчик на фронте
      // показывает «N/10 игроков».
      _count: { select: { members: { where: { isJudge: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, true));
}

export async function listPublicLobbies(viewerUserId: string): Promise<LobbySummary[]> {
  // Fetch the `members` relation filtered to the viewer's row only — that way we know
  // membership per lobby without loading every member in the result set.
  // host.isBot=false guards against orphaned lobbies created by older code that
  // transferred hostship to a bot when the original host left.
  const rows = await prisma.lobby.findMany({
    where: {
      isPrivate: false,
      status: 'WAITING',
      host: { isBot: false },
    },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      // Счётчик игроков без судьи (см. listUserActiveLobbies).
      _count: { select: { members: { where: { isJudge: false } } } },
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
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      members: {
        include: {
          user: {
            select: { id: true, nickname: true, publicCode: true, avatarUrl: true, isBot: true },
          },
        },
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

    // Откуда нужно автоматически выйти при удачном join — список заполнится
    // внутри транзакции и обрабатывается ПОСЛЕ commit'а (broadcast надо
    // делать вне транзакции).
    let evictedFromLobbies: string[] = [];
    const result = await prisma.$transaction(
      async (tx) => {
        // Re-read status inside the transaction to detect TOCTOU changes
        // (lobby could have transitioned to IN_GAME between the outer read and here).
        const currentStatus = await tx.lobby.findUnique({
          where: { id: lobbyId },
          select: { status: true },
        });
        if (!currentStatus || currentStatus.status !== 'WAITING') {
          return { kind: 'error' as const, error: LOBBY_ERROR.NOT_OPEN };
        }

        const existing = await tx.lobbyMember.findUnique({
          where: { lobbyId_userId: { lobbyId, userId } },
        });
        if (existing) return { kind: 'error' as const, error: LOBBY_ERROR.ALREADY_MEMBER };

        // Один пользователь = ровно одно WAITING-лобби. До добавления в
        // новое — выкидываем из всех старых, в которых юзер ещё числится.
        // Хосты не auto-evict'ятся — для них leave/close идёт отдельным
        // путём (он закроет всё лобби). Тут мы трогаем только non-host
        // membership.
        const otherMemberships = await tx.lobbyMember.findMany({
          where: {
            userId,
            lobbyId: { not: lobbyId },
            lobby: { status: 'WAITING', hostId: { not: userId } },
          },
          select: { lobbyId: true },
        });
        if (otherMemberships.length > 0) {
          await tx.lobbyMember.deleteMany({
            where: {
              userId,
              lobbyId: { in: otherMemberships.map((m) => m.lobbyId) },
            },
          });
          evictedFromLobbies = otherMemberships.map((m) => m.lobbyId);
        }

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

    // Broadcast по каждому старому лобби — там игрок исчез из списка.
    for (const evictedId of evictedFromLobbies) {
      void broadcastLobbyUpdate(evictedId);
    }
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
  // host leaves, the entire lobby is closed for everyone. If a game has already
  // been started for this lobby, end it too — otherwise the host gets bounced
  // straight back into the game by the active-game auto-redirect.
  if (lobby.hostId === userId) {
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: { status: 'CLOSED' },
    });
    await endActiveGameForLobby(lobbyId);
    void broadcastLobbyUpdate(lobbyId);
    return ok({ closed: true });
  }

  await prisma.lobbyMember.delete({ where: { lobbyId_userId: { lobbyId, userId } } });
  // If the game has already started, the user is also a GameParticipant. Mark
  // them as removed there too so the active-game auto-redirect on the home
  // page doesn't drag them back into a game they consciously left.
  await removeUserFromActiveGameForLobby(lobbyId, userId);
  void broadcastLobbyUpdate(lobbyId);
  return ok({ closed: false });
}

// Flip the caller's "Готов" flag. Used by the lobby room toggle button —
// host can start the game only when every member's flag is true (bots
// included, but they're seeded ready=true on insert).
export async function setReady(
  lobbyId: string,
  userId: string,
  ready: boolean,
): Promise<ServiceResult<LobbyDetails>> {
  const member = await prisma.lobbyMember.findUnique({
    where: { lobbyId_userId: { lobbyId, userId } },
    select: { userId: true },
  });
  if (!member) return fail(LOBBY_ERROR.NOT_MEMBER);

  await prisma.lobbyMember.update({
    where: { lobbyId_userId: { lobbyId, userId } },
    data: { isReady: ready },
  });

  void broadcastLobbyUpdate(lobbyId);
  // Mirror the response shape of other mutations so the caller can swap the
  // returned lobby into the React Query cache without a follow-up refetch.
  const updated = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      members: {
        include: {
          user: {
            select: { id: true, nickname: true, publicCode: true, avatarUrl: true, isBot: true },
          },
        },
        orderBy: [{ isJudge: 'desc' }, { seat: 'asc' }],
      },
    },
  });
  if (!updated) return fail(LOBBY_ERROR.NOT_FOUND);
  return ok(toLobbyDetails(updated, userId));
}

export async function closeLobby(
  lobbyId: string,
  userId: string,
): Promise<ServiceResult<{ closed: true }>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: { id: true, hostId: true, status: true },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  if (lobby.hostId !== userId) return fail(LOBBY_ERROR.NOT_HOST);
  if (lobby.status === 'CLOSED') return ok({ closed: true });

  // Если хост закрывает лобби в момент идущей игры — игру тоже завершаем.
  // Иначе остаётся «осиротевшая» игра в registry: участники видят активный
  // редирект и попадают в фантомный матч, чей parent lobby уже CLOSED.
  await endActiveGameForLobby(lobbyId);

  await prisma.lobby.update({
    where: { id: lobbyId },
    data: { status: 'CLOSED' },
  });
  // Chat is an in-memory pre-game buffer; once the lobby closes there's no
  // one left to read it and no reason to keep the messages around.
  clearLobbyChat(lobbyId);
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

// Host-only dev affordance: pre-assign a specific role to a member's seat.
// On game start, the engine honors this role instead of randomizing. Passing
// role=null clears any prior pre-assignment. Server enforces role-count caps
// (max 1 sheriff / 1 don / 2 mafia) — exceeding them returns a conflict.
export async function preassignRole(
  lobbyId: string,
  hostUserId: string,
  targetUserId: string,
  role: 'civilian' | 'sheriff' | 'mafia' | 'don' | null,
): Promise<ServiceResult<LobbyDetails>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      status: true,
      hostId: true,
      members: { select: { userId: true, isJudge: true, preassignedRole: true } },
    },
  });
  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  if (lobby.hostId !== hostUserId) return fail(LOBBY_ERROR.NOT_HOST);
  if (lobby.status !== 'WAITING') return fail(LOBBY_ERROR.NOT_OPEN);

  const target = lobby.members.find((m) => m.userId === targetUserId);
  if (!target) return fail(LOBBY_ERROR.TARGET_NOT_FOUND);
  if (target.isJudge) return fail(LOBBY_ERROR.TARGET_NOT_FOUND);

  if (role !== null) {
    // Caps: 1 sheriff, 1 don, 2 mafia, the rest civilians (no civilian cap
    // because they're the fallback).
    const caps: Record<string, number> = { sheriff: 1, don: 1, mafia: 2 };
    const cap = caps[role];
    if (cap !== undefined) {
      const taken = lobby.members.filter(
        (m) => !m.isJudge && m.userId !== targetUserId && m.preassignedRole === role,
      ).length;
      if (taken >= cap) return fail(LOBBY_ERROR.ROLE_CAP_REACHED);
    }
  }

  await prisma.lobbyMember.update({
    where: { lobbyId_userId: { lobbyId, userId: targetUserId } },
    data: { preassignedRole: role },
  });

  void broadcastLobbyUpdate(lobbyId);
  return getLobbyDetails(lobbyId, hostUserId);
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
