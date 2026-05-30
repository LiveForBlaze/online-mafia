// Auth projection / serialization layer.
//
// Pure mappers from Prisma `User` rows to the public/authenticated DTOs, plus
// the shared error-code constants and result types used across the auth
// services. No business mutations live here.

import type { AuthenticatedUser, PublicUserProfile } from '@mafia/shared';
import type { User } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';

// Reasons returned by auth operations. Routes translate these to HTTP status codes.
export const AUTH_ERROR = {
  EMAIL_TAKEN: 'email_taken',
  NICKNAME_TAKEN: 'nickname_taken',
  NICKNAME_REJECTED: 'nickname_rejected',
  INVALID_CREDENTIALS: 'invalid_credentials',
  PASSWORD_NOT_SET: 'password_not_set',
  OAUTH_LINK_REFUSED: 'oauth_link_refused',
  OAUTH_EMAIL_NOT_VERIFIED: 'oauth_email_not_verified',
  // Юзер пытается надеть аватар, который unlock'ается достижением, которого
  // у него нет. UI обычно не даёт нажать на такие slot'ы — этот код для
  // случая, когда клиент собрал руками или старый кешированный.
  AVATAR_LOCKED: 'avatar_locked',
} as const;
export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR];

export interface AuthFailure {
  ok: false;
  error: AuthErrorCode;
}
export interface AuthSuccess {
  ok: true;
  user: User;
}
export type AuthResult = AuthSuccess | AuthFailure;

// Loaded explicitly by /auth/me; passed as a denormalised bundle so we
// don't redo three queries per request. See loadAuthenticatedUserBundle.
export interface AuthenticatedUserBundle {
  user: User;
  memberships: {
    club: { id: string; name: string; publicCode: string; headId: string };
    joinedAt: Date;
  }[];
  pendingClubCodes: string[];
  primaryClub: { id: string; name: string; publicCode: string } | null;
}

export function toAuthenticatedUser(bundle: AuthenticatedUserBundle): AuthenticatedUser {
  const { user, memberships, pendingClubCodes, primaryClub } = bundle;
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    publicCode: user.publicCode,
    avatarUrl: user.avatarUrl ?? null,
    googleAvatarUrl: user.googleAvatarUrl ?? null,
    realName: user.realName ?? null,
    country: user.country ?? null,
    hasPassword: Boolean(user.passwordHash),
    achievements: parseAchievements(user.achievements),
    isAdmin: user.isAdmin,
    banRestrictions: user.banRestrictions,
    clubMemberships: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      clubCode: m.club.publicCode,
      isHead: m.club.headId === user.id,
      joinedAt: m.joinedAt.toISOString(),
    })),
    pendingClubCodes,
    primaryClub: primaryClub
      ? { clubId: primaryClub.id, clubName: primaryClub.name, clubCode: primaryClub.publicCode }
      : null,
  };
}

// One-shot loader for the /auth/me / login / register flows. Reads the user,
// their clubs, and their pending requests in parallel. Computes effective
// primary club: explicit override if set + still member, else newest membership.
export async function loadAuthenticatedUserBundle(
  userId: string,
): Promise<AuthenticatedUserBundle | null> {
  const [user, memberships, pendingRequests] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.clubMember.findMany({
      where: { userId },
      include: {
        club: { select: { id: true, name: true, publicCode: true, headId: true } },
      },
      orderBy: { joinedAt: 'desc' }, // newest first — first entry = default primary
    }),
    prisma.clubJoinRequest.findMany({
      where: { userId },
      include: { club: { select: { publicCode: true } } },
    }),
  ]);
  if (!user) return null;

  // Resolve primary club. Explicit primaryClubId wins if user is still a
  // member; otherwise fall back to newest membership.
  let primaryClub: AuthenticatedUserBundle['primaryClub'] = null;
  if (user.primaryClubId) {
    const m = memberships.find((m) => m.club.id === user.primaryClubId);
    if (m) primaryClub = { id: m.club.id, name: m.club.name, publicCode: m.club.publicCode };
  }
  if (!primaryClub && memberships.length > 0) {
    const m = memberships[0]!;
    primaryClub = { id: m.club.id, name: m.club.name, publicCode: m.club.publicCode };
  }

  return {
    user,
    memberships,
    pendingClubCodes: pendingRequests.map((r) => r.club.publicCode),
    primaryClub,
  };
}

// achievements хранится как Json. Защищаемся от мусора (старые записи /
// ручной импорт): дропаем всё, что не похоже на { id: string, earnedAt:
// ISO-string }. Та же логика что в toPublicUserProfile — выделена в
// отдельный хелпер чтобы её не дублировать дважды.
function parseAchievements(raw: unknown): { id: string; earnedAt: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is { id: string; earnedAt: string } =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>).id === 'string' &&
      typeof (a as Record<string, unknown>).earnedAt === 'string',
  );
}

/** Public projection — no email exposed. */
export function toPublicUserProfile(user: User): PublicUserProfile {
  // `winsByRole` хранится как Json — Prisma отдаёт его типом `JsonValue`.
  // Нам нужно строго `{ civilian, sheriff, mafia, don }`. Извлекаем
  // безопасно: если поле не объект (старые записи, ручной import) или
  // отсутствуют какие-то роли — подставляем 0.
  const raw = (user.winsByRole ?? {}) as Record<string, unknown>;
  const intOrZero = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;

  // Достижения тоже хранятся как JSON-массив; защищаемся от мусора
  // (старые записи / ручной импорт): дроп всё, что не похоже на
  // { id: string, earnedAt: string-ISO }.
  const achievementsRaw = (user.achievements ?? []) as unknown;
  const achievements: PublicUserProfile['achievements'] = Array.isArray(achievementsRaw)
    ? (achievementsRaw.filter(
        (a): a is { id: string; earnedAt: string } =>
          typeof a === 'object' &&
          a !== null &&
          typeof (a as Record<string, unknown>).id === 'string' &&
          typeof (a as Record<string, unknown>).earnedAt === 'string',
      ) as PublicUserProfile['achievements'])
    : [];

  return {
    id: user.id,
    publicCode: user.publicCode,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    realName: user.realName ?? null,
    country: user.country ?? null,
    primaryClubName: null, // populated by listPublicUsers / findUserByPublicCode wrappers (see Task 9)
    createdAt: user.createdAt.toISOString(),
    gamesPlayed: user.gamesPlayed,
    wins: user.wins,
    losses: user.losses,
    gamesAsJudge: user.gamesAsJudge,
    winsByRole: {
      civilian: intOrZero(raw.civilian),
      sheriff: intOrZero(raw.sheriff),
      mafia: intOrZero(raw.mafia),
      don: intOrZero(raw.don),
    },
    achievements,
  };
}

// Variant of toPublicUserProfile for callers that have resolved the primary
// club name (via the listPublicUsers / findUserByPublicCode include). The
// resolution rule is the same as for AuthenticatedUser.primaryClub:
//   1. If user.primaryClubId points to a still-active membership → use that.
//   2. Else fall back to the user's newest active ClubMember.
//   3. If no memberships at all → null.
//
// Callers must pass the already-resolved name to avoid an extra query per row.
export function toPublicUserProfileWithClub(
  user: User,
  primaryClubName: string | null,
): PublicUserProfile {
  return { ...toPublicUserProfile(user), primaryClubName };
}
