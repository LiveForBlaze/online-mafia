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
import { handOffOrDisbandHeadClubs } from '../clubs/club.service.js';
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
  offset?: number;
}

const DEFAULT_PAGE_SIZE = 50;

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

  const take = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), 200);
  const skip = Math.max(input.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    prisma.lobby.findMany({
      where,
      include: {
        host: { select: { id: true, nickname: true, email: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
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
  offset?: number;
  // Боты (isBot=true) и удалённые аккаунты по умолчанию скрыты — они шумят
  // и над ними нечего делать. Админ может явно запросить через флаг.
  includeBots?: boolean;
}

export async function listUsersForAdmin(
  input: ListUsersInput,
): Promise<{ users: AdminUserSummary[]; total: number }> {
  const search = input.search?.trim();
  // Базовый фильтр — всегда исключаем удалённые аккаунты (email на
  // @deleted.local — конвенция deleteOwnAccount/deleteUserAsAdmin). Ботов
  // прячем по умолчанию.
  const baseWhere: Prisma.UserWhereInput = {
    email: { not: { endsWith: '@deleted.local' } },
  };
  if (!input.includeBots) {
    baseWhere.isBot = false;
  }
  const where: Prisma.UserWhereInput = search
    ? {
        ...baseWhere,
        OR: [
          { nickname: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { publicCode: { equals: search.toUpperCase() } },
        ],
      }
    : baseWhere;

  const take = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), 200);
  const skip = Math.max(input.offset ?? 0, 0);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        publicCode: true,
        isAdmin: true,
        isBot: true,
        banRestrictions: true,
        bannedAt: true,
        banReason: true,
        createdAt: true,
      },
      orderBy: [{ isAdmin: 'desc' }, { createdAt: 'desc' }],
      take,
      skip,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: rows.map((u) => ({
      id: u.id,
      email: u.email,
      nickname: u.nickname,
      publicCode: u.publicCode,
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
  const bannedAt = isBanned ? new Date() : null;

  // updateMany (а не update) чтобы навесить защитный where: нельзя
  // воскрешать/банить удалённый аккаунт (email на @deleted.local) или
  // мутировать бота. На отсутствие совпадения возвращаем null — тот же
  // not-found-сигнал что и раньше (update кидал P2025), но без throw.
  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      email: { not: { endsWith: '@deleted.local' } },
      isBot: false,
    },
    data: {
      banRestrictions: dedup,
      bannedAt,
      banReason: isBanned ? (reason ?? null) : null,
      // При смене ограничений бамаем tokenVersion — это:
      //  (1) отрубает старые JWT (включая те, в которых юзер ещё не знал
      //      про новый бан),
      //  (2) триггерит дисконнект всех сокетов на следующем recheck цикле
      //      (хотя мы и так сразу зовём disconnectUser — это страховка).
      tokenVersion: { increment: 1 },
    },
  });
  if (updated.count === 0) return null;
  logger.info(
    { userId, restrictions: dedup, reason, isBanned },
    'admin: user restrictions updated',
  );
  return {
    userId,
    banRestrictions: dedup,
    bannedAt: bannedAt ? bannedAt.toISOString() : null,
  };
}

export async function renameUserAsAdmin(userId: string, nickname: string): Promise<boolean> {
  // Без модерации — админ знает, что делает. Часто как раз и нужен чтобы
  // «снять» нецензурный никнейм одним кликом.
  const updated = await prisma.user.updateMany({
    // Защитный where: нельзя переименовать удалённый аккаунт
    // (email на @deleted.local) или бота.
    where: {
      id: userId,
      email: { not: { endsWith: '@deleted.local' } },
      isBot: false,
    },
    data: { nickname },
  });
  return updated.count > 0;
}

// Проверка что target — не админ. Защита от ситуации, где один админ
// сносит другого (или себя) и площадка остаётся без модерации до
// следующего бутстрапа из ENV. Возвращает true если действовать БЕЗОПАСНО
// (target не админ), false если запрещено.
export async function targetIsNonAdmin(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  return Boolean(target && !target.isAdmin);
}

export async function deleteUserAsAdmin(userId: string): Promise<boolean> {
  // Hand off / disband any head-clubs first. Without this, the Club.headId
  // ON DELETE RESTRICT would block updates if we ever switched to hard
  // delete, and conceptually leaves orphaned heads on anonymised rows.
  await handOffOrDisbandHeadClubs(userId);

  // Анонимизация, не cascade-delete: на юзера ссылается куча append-only
  // данных (GameEvent.actorId, GameParticipant). Если их обнулять, разломаем
  // event log. Поэтому — обнуляем PII + ставим site_access (мёртвый аккаунт,
  // история партий цела).
  //
  // Используем ту же конвенцию что и deleteOwnAccount (email на @deleted.local,
  // nickname `[удалён]`) — у админ-списка один фильтр, и оба удаления
  // выглядят одинаково в логах партий.
  const deletedMarker = `deleted-${userId}@deleted.local`;
  await prisma.$transaction(async (tx) => {
    await tx.lobbyMember.deleteMany({ where: { userId } });
    await tx.lobby.updateMany({ where: { hostId: userId }, data: { status: 'CLOSED' } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: deletedMarker,
        nickname: '[удалён]',
        passwordHash: null,
        googleId: null,
        avatarUrl: null,
        googleAvatarUrl: null,
        realName: null,
        country: null,
        isAdmin: false,
        banRestrictions: [BAN_RESTRICTION.SITE_ACCESS],
        bannedAt: new Date(),
        banReason: 'account deleted by admin',
        tokenVersion: { increment: 1 },
      },
    });
  });
  logger.info({ userId }, 'admin: user anonymised + locked out');
  return true;
}
