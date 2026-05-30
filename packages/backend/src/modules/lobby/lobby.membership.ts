// Lobby module — join / leave / seat placement.
//
// Concurrency: joinLobby uses a Serializable transaction so two players cannot
// grab the same seat. If the database detects a serialization conflict, we
// surface a clean `seat_contention` error and let the client retry.

import { Prisma, type LobbyMember } from '@prisma/client';
import {
  GAME,
  LOBBY,
  MEMBER_ROLE,
  type JoinLobbyInput,
  type LobbyDetails,
  type MemberRole,
} from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { verifyPassword } from '../../lib/password.js';
import { endActiveGameForLobby, removeUserFromActiveGameForLobby } from '../game/game.service.js';

import { LOBBY_ERROR, type LobbyErrorCode } from './lobby.errors.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { getLobbyDetails } from './lobby.queries.js';
import {
  ok,
  fail,
  isSerializationFailure,
  isUniqueConstraintViolation,
  type ServiceResult,
} from './lobby.service.internal.js';

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
    // Плюс защита от race: лобби могло уйти в IN_GAME между SELECT и
    // DELETE, тогда юзер остался GameParticipant'ом — чистим явно.
    await Promise.allSettled(
      evictedFromLobbies.flatMap((evictedId) => [
        broadcastLobbyUpdate(evictedId),
        removeUserFromActiveGameForLobby(evictedId, userId),
      ]),
    );
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

// Re-export the LOBBY_MAX_MEMBERS limit for routes that need it.
export const LOBBY_LIMITS = {
  MAX_MEMBERS: LOBBY.MAX_MEMBERS,
} as const;
