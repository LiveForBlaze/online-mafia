// Admin operations on lobbies and users.
//
// All endpoints in this module are guarded by `app.requireAdmin`, which checks
// `request.userFlags.isAdmin` (set in security.ts authenticate decorator).
// Service-layer code here trusts that the caller is already verified as admin —
// the auth gate is in the route layer.

import { LobbyStatus, type Prisma } from '@prisma/client';
import {
  BAN_RESTRICTION,
  type AdminLobbySummary,
  type AdminUserSummary,
  type BanRestrictionCode,
} from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../lib/logger.js';
import { broadcastLobbyUpdate } from '../lobby/lobby.broadcast.js';
import { clearLobbyChat } from '../lobby/lobby.chat.js';
import { endActiveGameForLobby } from '../game/game.service.js';

// ---- Lobbies ----

export interface ListLobbiesInput {
  // 'ACTIVE' — meta-статус: WAITING ∪ IN_GAME. Дефолт для админ-UI: закрытые
  // лобби визуально шумят и не требуют действий, их прячем пока админ
  // явно не запросит "Все" или "Закрытые".
  status?: LobbyStatus | 'ALL' | 'ACTIVE';
  search?: string;
  limit?: number;
}

export async function listLobbiesForAdmin(
  input: ListLobbiesInput,
): Promise<{ lobbies: AdminLobbySummary[]; total: number }> {
  const where: Prisma.LobbyWhereInput = {};
  if (input.status === 'ACTIVE') {
    where.status = { in: [LobbyStatus.WAITING, LobbyStatus.IN_GAME] };
  } else if (input.status && input.status !== 'ALL') {
    where.status = input.status;
  }
  if (input.search?.trim()) {
    where.name = { contains: input.search.trim(), mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    prisma.lobby.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true, email: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit ?? 100,
    }),
    prisma.lobby.count({ where }),
  ]);

  return {
    lobbies: rows.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      isPrivate: l.isPrivate,
      hostId: l.hostId,
      hostNickname: l.host.nickname,
      hostEmail: l.host.email,
      memberCount: l._count.members,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
  };
}

export async function renameLobbyAsAdmin(lobbyId: string, name: string): Promise<boolean> {
  // Намеренно пропускаем AI-модерацию — админ может назвать как угодно
  // (вернуть лобби с матом в нейтральное «Лобби» одним кликом).
  const updated = await prisma.lobby.updateMany({
    where: { id: lobbyId },
    data: { name },
  });
  if (updated.count > 0) void broadcastLobbyUpdate(lobbyId);
  return updated.count > 0;
}

export async function forceCloseLobbyAsAdmin(lobbyId: string): Promise<boolean> {
  const lobby = await prisma.lobby.findUnique({ where: { id: lobbyId }, select: { id: true } });
  if (!lobby) return false;

  await endActiveGameForLobby(lobbyId);
  await prisma.lobby.update({
    where: { id: lobbyId },
    data: { status: LobbyStatus.CLOSED },
  });
  clearLobbyChat(lobbyId);
  void broadcastLobbyUpdate(lobbyId);
  return true;
}

// ---- Users ----

export interface ListUsersInput {
  search?: string;
  limit?: number;
}

export async function listUsersForAdmin(
  input: ListUsersInput,
): Promise<{ users: AdminUserSummary[]; total: number }> {
  const search = input.search?.trim();
  const where: Prisma.UserWhereInput = search
    ? {
        OR: [
          { nickname: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { publicCode: { equals: search.toUpperCase() } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        publicCode: true,
        clubName: true,
        isAdmin: true,
        isBot: true,
        banRestrictions: true,
        bannedAt: true,
        banReason: true,
        createdAt: true,
      },
      orderBy: [{ isAdmin: 'desc' }, { createdAt: 'desc' }],
      take: input.limit ?? 100,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      publicCode: u.publicCode,
      clubName: u.clubName,
      isAdmin: u.isAdmin,
      isBot: u.isBot,
      banRestrictions: u.banRestrictions,
      bannedAt: u.bannedAt ? u.bannedAt.toISOString() : null,
      banReason: u.banReason,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
  };
}

export interface SetRestrictionsResult {
  userId: string;
  banRestrictions: string[];
  bannedAt: string | null;
}

export async function setUserRestrictions(
  userId: string,
  restrictions: BanRestrictionCode[],
  reason: string | null,
): Promise<SetRestrictionsResult | null> {
  // Дедуп + sort для стабильности (так одинаковые наборы сохраняются
  // одинаково — упрощает debug-сравнение).
  const dedup = Array.from(new Set(restrictions)).sort();
  const isBanned = dedup.length > 0;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      banRestrictions: dedup,
      bannedAt: isBanned ? new Date() : null,
      banReason: isBanned ? (reason ?? null) : null,
      // При смене ограничений бамаем tokenVersion — это:
      //  (1) отрубает старые JWT (включая те, в которых юзер ещё не знал
      //      про новый бан),
      //  (2) триггерит дисконнект всех сокетов на следующем recheck цикле
      //      (хотя мы и так сразу зовём disconnectUser — это страховка).
      tokenVersion: { increment: 1 },
    },
    select: { id: true, banRestrictions: true, bannedAt: true },
  });
  logger.info(
    { userId, restrictions: dedup, reason, isBanned },
    'admin: user restrictions updated',
  );
  return {
    userId: updated.id,
    banRestrictions: updated.banRestrictions,
    bannedAt: updated.bannedAt ? updated.bannedAt.toISOString() : null,
  };
}

export async function renameUserAsAdmin(userId: string, nickname: string): Promise<boolean> {
  // Без модерации — админ знает, что делает. Часто как раз и нужен чтобы
  // «снять» нецензурный никнейм одним кликом.
  const updated = await prisma.user.updateMany({
    where: { id: userId },
    data: { nickname },
  });
  return updated.count > 0;
}

export async function deleteUserAsAdmin(userId: string): Promise<boolean> {
  // Анонимизация, не cascade-delete: на юзера ссылается куча append-only
  // данных (GameEvent.actorId, GameParticipant). Если их обнулять, разломаем
  // event log. Поэтому — обнуляем PII + ставим site_access (так что аккаунт
  // мёртвый, но история партий цела).
  const stamp = Date.now();
  const anonEmail = `deleted-${stamp}-${userId.slice(0, 6)}@deleted.invalid`;
  const anonNickname = `Удалённый пользователь`;
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: anonEmail,
      nickname: anonNickname,
      passwordHash: null,
      googleId: null,
      avatarUrl: null,
      googleAvatarUrl: null,
      realName: null,
      country: null,
      clubName: null,
      isAdmin: false,
      banRestrictions: [BAN_RESTRICTION.SITE_ACCESS],
      bannedAt: new Date(),
      banReason: 'account deleted by admin',
      tokenVersion: { increment: 1 },
    },
  });
  logger.info({ userId }, 'admin: user anonymised + locked out');
  return true;
}
