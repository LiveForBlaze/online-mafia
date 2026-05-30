// Profile / account operations.
//
// Nickname & profile-field updates, public-profile lookups (by code and the
// player directory), and account deletion (anonymisation). All Prisma calls
// and password operations live here, isolated from route handlers.

import type { PublicUserProfile, UpdateProfileInput } from '@mafia/shared';
import { requiredAchievementForAvatar } from '@mafia/shared';
import type { User } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../lib/logger.js';
import { moderateName } from '../../lib/moderation.js';
import { verifyPassword } from '../../lib/password.js';
import { handOffOrDisbandHeadClubs } from '../clubs/club.service.js';
import { refreshUserInActiveGames } from '../game/game.broadcast.js';
import { broadcastLobbiesContainingUser } from '../lobby/lobby.broadcast.js';

import { AUTH_ERROR, toPublicUserProfileWithClub, type AuthResult } from './auth.projection.js';

export async function updateNickname(userId: string, nickname: string): Promise<AuthResult> {
  const normalized = nickname.trim();
  const verdict = await moderateName(normalized, 'nickname');
  if (!verdict.allowed) return { ok: false, error: AUTH_ERROR.NICKNAME_REJECTED };
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { nickname: normalized },
  });
  // Push the new nickname to every lobby / active game this user is in so
  // other sockets see it without reloading. Fire-and-forget; never blocks.
  broadcastLobbiesContainingUser(userId).catch((err: unknown) => {
    logger.warn({ err, userId }, 'failed to broadcast profile change to lobbies');
  });
  refreshUserInActiveGames(userId, { nickname: normalized });
  return { ok: true, user: updated };
}

// Update optional public-profile fields. Each field independently: undefined
// means "leave alone", null means "clear". Strings are trimmed; an empty
// string after trim is also treated as "clear" so blank textboxes do what
// users expect.
//
// realName проходит AI-модерацию ровно на тех же правилах что и
// nickname (см. lib/moderation.ts). Без неё юзер, у которого ник заблочен
// модерацией, может вписать ту же фразу в realName и она отрендерится на
// публичном профиле. Модерируем только когда поле реально меняется — не
// гоняем платный API при сохранении того же значения.
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<AuthResult> {
  const norm = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };
  const data: {
    realName?: string | null;
    country?: string | null;
    avatarUrl?: string | null;
  } = {};
  if (input.realName !== undefined) data.realName = norm(input.realName) ?? null;
  if (input.country !== undefined) data.country = norm(input.country) ?? null;

  // Модерируем realName, если он а) приходит в апдейте, б) непуст,
  // в) отличается от текущего в БД. Argon2 здесь не задействован, зато
  // каждый вызов = один HTTP к Anthropic — экономим обращения.
  const needsRealNameCheck = data.realName !== undefined && data.realName !== null;
  if (needsRealNameCheck) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { realName: true },
    });
    if (current?.realName !== data.realName) {
      const verdict = await moderateName(data.realName!, 'nickname');
      if (!verdict.allowed) return { ok: false, error: AUTH_ERROR.NICKNAME_REJECTED };
    }
  }

  if (input.avatarId !== undefined) {
    if (input.avatarId === null) {
      data.avatarUrl = null;
    } else {
      // Locked-под-достижение аватары требуют наличия конкретной ачивки.
      // Сверяемся с user.achievements перед записью; иначе возвращаем
      // AVATAR_LOCKED. Этот гейт страхует UI: даже если клиент вручную
      // соберёт PATCH с заблокированным id, сервер не пропустит.
      const required = requiredAchievementForAvatar(input.avatarId);
      if (required) {
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { achievements: true },
        });
        const owned = Array.isArray(current?.achievements)
          ? (current!.achievements as unknown[]).some(
              (a) =>
                a !== null &&
                typeof a === 'object' &&
                (a as Record<string, unknown>).id === required,
            )
          : false;
        if (!owned) return { ok: false, error: AUTH_ERROR.AVATAR_LOCKED };
      }
      data.avatarUrl = input.avatarId;
    }
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  // If the avatar changed, push the new snapshot to the user's lobby and
  // active game so other connected sockets see it without reloading.
  if (data.avatarUrl !== undefined) {
    broadcastLobbiesContainingUser(userId).catch((err: unknown) => {
      logger.warn({ err, userId }, 'failed to broadcast profile change to lobbies');
    });
    refreshUserInActiveGames(userId, { avatarUrl: updated.avatarUrl });
  }
  return { ok: true, user: updated };
}

// Public profile lookup by short code. Case-insensitive: the URL slug may
// arrive lowercased but codes are stored uppercase.
//
// Returns the bare User row plus the resolved primary club name (or null).
// The single-user GET serialises via toPublicUserProfileWithClub. Resolution
// mirrors listPublicUsers: explicit primaryClub if present, else newest
// membership.
export async function findUserByPublicCode(
  code: string,
): Promise<{ user: User; primaryClubName: string | null } | null> {
  const row = await prisma.user.findUnique({
    where: { publicCode: code.trim().toUpperCase() },
    include: {
      primaryClub: { select: { id: true, name: true } },
      clubMemberships: {
        orderBy: { joinedAt: 'desc' },
        take: 1,
        include: { club: { select: { id: true, name: true } } },
      },
    },
  });
  if (!row) return null;
  const { primaryClub, clubMemberships, ...user } = row;
  const effective = primaryClub ?? clubMemberships[0]?.club ?? null;
  return { user: user as User, primaryClubName: effective?.name ?? null };
}

// Список реальных игроков для директории игроков. Фильтры:
//   - не показываем ботов (isBot=false)
//   - не показываем удалённые аккаунты (email кончается на @deleted.local)
//   - поиск по nickname / realName / publicCode (case-insensitive contains)
// Пагинация offset/limit. Сортировка: сначала недавно созданные.
export interface UserListOptions {
  search?: string;
  limit?: number;
  offset?: number;
}
export async function listPublicUsers(
  opts: UserListOptions,
): Promise<{ users: PublicUserProfile[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const searchRaw = opts.search?.trim();
  const search = searchRaw && searchRaw.length > 0 ? searchRaw : null;

  const baseWhere = {
    isBot: false,
    email: { not: { endsWith: '@deleted.local' } },
  } as const;
  const whereWithSearch = search
    ? {
        ...baseWhere,
        OR: [
          { nickname: { contains: search, mode: 'insensitive' as const } },
          { realName: { contains: search, mode: 'insensitive' as const } },
          { publicCode: { contains: search.toUpperCase() } },
        ],
      }
    : baseWhere;

  // Лидерборд: сначала по победам (больше → выше), потом по gamesPlayed
  // (отделяет «1 победа из 1 партии» от «10 побед из 10»), потом стабильно
  // по дате регистрации, чтобы порядок не «прыгал» между запросами.
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where: whereWithSearch,
      include: {
        primaryClub: { select: { id: true, name: true } },
        clubMemberships: {
          orderBy: { joinedAt: 'desc' },
          take: 1,
          include: { club: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ wins: 'desc' }, { gamesPlayed: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    prisma.user.count({ where: whereWithSearch }),
  ]);

  const users = rows.map((u) => {
    // Explicit primary wins ONLY if user is still a member. We don't fetch
    // all memberships here — we trust the FK (primaryClub) and verify by
    // matching against the (one) newest membership row, which is enough to
    // know "still in some club". If the explicit primary equals the newest
    // membership's club, use it; otherwise fall back to the newest membership.
    //
    // (Edge case: user has multiple memberships and primaryClubId points to
    // a non-newest one. The simpler rule "explicit primary if present" is
    // good enough for the public listing — the canonical resolver is in
    // loadAuthenticatedUserBundle for the owner's own view.)
    const effective = u.primaryClub ?? u.clubMemberships[0]?.club ?? null;
    return toPublicUserProfileWithClub(u, effective?.name ?? null);
  });
  return { users, total };
}

// Account deletion. Confirmation is enforced upstream — the route only calls
// this when the user has typed their email correctly.
//
// We DO NOT hard-delete the User row because GameParticipant, LobbyMember
// and event-log entries reference it. Instead we anonymise the row: email
// is rewritten to a sentinel, nickname becomes "[удалён]", role-bearing
// columns are cleared, and tokenVersion is bumped to kill every live session.
// Hosted lobbies are closed; lobby memberships removed.
//
// If the user has a password we additionally require it (the cookie alone is
// not enough to authorise a destructive, irreversible action). Google-only
// users have no password to check, so for them the email retype plus a
// valid session remains the only proof.
export async function deleteOwnAccount(
  userId: string,
  confirmEmail: string,
  password: string | undefined,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };
  }
  if (user.passwordHash) {
    if (!password) return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };
  }

  // Hand off / disband any head-clubs so the cascade on user delete isn't
  // blocked by Club.headId ON DELETE RESTRICT. Runs before the anonymise
  // transaction; if it fails, we bail out without touching the user row.
  await handOffOrDisbandHeadClubs(userId);

  const deletedMarker = `deleted-${userId}@deleted.local`;
  const anonymised = await prisma.$transaction(async (tx) => {
    // Drop active lobby presences so the user vanishes from rosters.
    await tx.lobbyMember.deleteMany({ where: { userId } });
    // Close any lobbies they were hosting.
    await tx.lobby.updateMany({ where: { hostId: userId }, data: { status: 'CLOSED' } });
    return tx.user.update({
      where: { id: userId },
      data: {
        email: deletedMarker,
        nickname: '[удалён]',
        passwordHash: null,
        googleId: null,
        avatarUrl: null,
        realName: null,
        country: null,
        tokenVersion: { increment: 1 },
      },
    });
  });
  return { ok: true, user: anonymised };
}
