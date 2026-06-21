// Lobby module — in-room host/member actions: ready toggle, close, claim judge
// seat, pre-assign roles, kick.

import { type LobbyDetails } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { endActiveGameForLobby } from '../game/game.service.js';

import { LOBBY_ERROR } from './lobby.errors.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { clearLobbyChat } from './lobby.chat.js';
import { toLobbyDetails } from './lobby.mappers.js';
import { getLobbyDetails } from './lobby.queries.js';
import {
  ok,
  fail,
  isUniqueConstraintViolation,
  type ServiceResult,
} from './lobby.service.internal.js';

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
    select: { userId: true, lobby: { select: { status: true } } },
  });
  if (!member) return fail(LOBBY_ERROR.NOT_MEMBER);
  // Only a WAITING lobby accepts ready-flips. Once the game has started the
  // flag is meaningless — without this guard a member could toggle it after
  // IN_GAME and desync the lobby view from the game.
  if (member.lobby.status !== 'WAITING') return fail(LOBBY_ERROR.NOT_OPEN);

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

  // This read-check-update isn't atomic on its own — two concurrent claims
  // can both clear the `judgeTaken` gate above. The DB-level partial unique
  // index (LobbyMember_one_judge_per_lobby, WHERE isJudge=true) is the real
  // guard: the losing writer trips P2002, which we map back to the same
  // JUDGE_SLOT_TAKEN domain error rather than letting it surface as a 500.
  try {
    await prisma.lobbyMember.update({
      where: { lobbyId_userId: { lobbyId, userId } },
      data: { seat: null, isJudge: true },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return fail(LOBBY_ERROR.JUDGE_SLOT_TAKEN);
    throw error;
  }

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
