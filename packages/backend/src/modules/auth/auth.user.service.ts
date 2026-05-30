// User lookup / creation / authentication.
//
// Password registration & login, Google OAuth resolution, by-id lookup, and
// the "logout everywhere" token-version bump. All Prisma calls and password
// operations live here, isolated from route handlers.

import { Prisma } from '@prisma/client';
import type { LoginInput, RegisterInput } from '@mafia/shared';
import type { User } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { allocatePublicCode } from '../../lib/public-code.js';

import { AUTH_ERROR, type AuthErrorCode, type AuthResult } from './auth.projection.js';
import type { GoogleUserInfo } from './google.js';

export async function registerWithPassword(input: RegisterInput): Promise<AuthResult> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedNickname = input.nickname.trim();

  // Email uniqueness is enforced by the DB unique constraint + the
  // isEmailCollision catch on create() below — NOT by an early findUnique.
  // Skipping the early check is deliberate: an early "email taken" return would
  // respond instantly for existing emails but only after moderateName + argon2
  // for new ones, giving an attacker a timing oracle to enumerate registered
  // emails. Letting both paths run the same moderate+hash work keeps timing
  // uniform; registration isn't a hot path, so the extra hash on a taken email
  // is an acceptable cost.

  // AI-moderate the nickname before we hash the password — argon2 is the most
  // expensive step here, no point burning it on a name we're about to reject.
  const verdict = await moderateName(normalizedNickname, 'nickname');
  if (!verdict.allowed) return { ok: false, error: AUTH_ERROR.NICKNAME_REJECTED };

  const passwordHash = await hashPassword(input.password);

  // Retry loop handles the rare case where two registrations collide on publicCode
  // or email (concurrent requests that both pass the findUnique check above).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = await allocatePublicCode(async (code) => {
      const taken = await prisma.user.findUnique({
        where: { publicCode: code },
        select: { id: true },
      });
      return Boolean(taken);
    });
    try {
      const user = await prisma.user.create({
        data: { email: normalizedEmail, nickname: normalizedNickname, publicCode, passwordHash },
      });
      return { ok: true, user };
    } catch (error) {
      if (isPublicCodeCollision(error)) continue;
      if (isEmailCollision(error)) return { ok: false, error: AUTH_ERROR.EMAIL_TAKEN };
      throw error;
    }
  }
  throw new Error('Could not allocate a unique publicCode after retries');
}

export async function loginWithPassword(input: LoginInput): Promise<AuthResult> {
  const normalizedEmail = input.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // Return the same error whether the email is unknown or the password is wrong,
    // to avoid leaking which emails are registered.
    return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };
  }

  if (!user.passwordHash) {
    // User registered via OAuth only and has not set a password.
    return { ok: false, error: AUTH_ERROR.PASSWORD_NOT_SET };
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) return { ok: false, error: AUTH_ERROR.INVALID_CREDENTIALS };

  return { ok: true, user };
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

// «Выйти со всех устройств». Бампает tokenVersion на User-строке —
// сравниваем `v` JWT-токена с этим значением при handshake (socketio.ts) и
// в HTTP-`authenticate` декораторе. Эффект:
//   * Все существующие cookie/JWT для этого юзера становятся невалидны.
//   * Активные Socket.IO-сокеты падают через RECHECK_INTERVAL_MS (5 минут).
//   * Активные LiveKit-сессии: отдельный revoke вызывается из роута.
//
// Это отдельный эндпоинт (а не дефолт `/logout`), потому что обычный logout
// в одной вкладке не должен выкидывать пользователя из остальных. Имя
// `logout-everywhere` — явное согласие на разлогин всех устройств.
export async function logoutEverywhere(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/**
 * Resolve a Google profile to a local user. Cases:
 *   1. An existing user has this googleId   -> return them (login)
 *   2. An existing user matches the email   -> link only if SAFE (see below)
 *   3. No match                              -> create a new user
 *
 * Account-linking safety: if a local user signed up with a password but never
 * verified their email, we MUST NOT silently link a Google account with that
 * same email — the local row may have been created by an attacker who simply
 * guessed the victim's email, intending to take it over once the victim signs
 * in with Google. We refuse the link and surface a typed error.
 */
export async function findOrCreateUserFromGoogle(
  profile: GoogleUserInfo,
): Promise<{ ok: true; user: User } | { ok: false; error: AuthErrorCode }> {
  if (!profile.email_verified) {
    return { ok: false, error: AUTH_ERROR.OAUTH_EMAIL_NOT_VERIFIED };
  }

  const normalizedEmail = profile.email.toLowerCase().trim();

  const byGoogleId = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (byGoogleId) {
    // Кэш `googleAvatarUrl` обновляем (на случай если когда-нибудь вернём
    // фичу или дадим админский экспорт), но `avatarUrl` НЕ трогаем —
    // курируемый набор стандартных + reward-аватарок мы не должны
    // подменять Google-фоткой.
    const newGooglePhoto = profile.picture ?? null;
    if (newGooglePhoto !== byGoogleId.googleAvatarUrl) {
      const refreshed = await prisma.user.update({
        where: { id: byGoogleId.id },
        data: { googleAvatarUrl: newGooglePhoto },
      });
      return { ok: true, user: refreshed };
    }
    return { ok: true, user: byGoogleId };
  }

  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (byEmail) {
    if (byEmail.passwordHash && !byEmail.emailVerified) {
      return { ok: false, error: AUTH_ERROR.OAUTH_LINK_REFUSED };
    }
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.sub,
        emailVerified: true,
        // Кэшируем Google-фото в `googleAvatarUrl` для аудита, но `avatarUrl`
        // оставляем как было: пользователь видит свою стартовую инициалку и
        // выбирает аватар из курируемого набора в /user.
        googleAvatarUrl: profile.picture ?? null,
      },
    });
    return { ok: true, user: updated };
  }

  // Google supplied the user's display name. We still moderate it because
  // Google names aren't curated — but unlike password registration, we don't
  // want to block account creation entirely if the name is rejected. Fall
  // back to the email's local-part (also moderated), and finally to a
  // neutral placeholder. The user can rename themselves afterwards.
  const googleName = profile.name?.trim();
  const emailPrefix = normalizedEmail.split('@')[0] ?? 'user';
  let nickname: string;
  if (googleName && (await moderateName(googleName, 'nickname')).allowed) {
    nickname = googleName;
  } else if ((await moderateName(emailPrefix, 'nickname')).allowed) {
    nickname = emailPrefix;
  } else {
    nickname = 'player';
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = await allocatePublicCode(async (code) => {
      const taken = await prisma.user.findUnique({
        where: { publicCode: code },
        select: { id: true },
      });
      return Boolean(taken);
    });
    try {
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          nickname,
          publicCode,
          googleId: profile.sub,
          // avatarUrl остаётся null: новые юзеры выбирают аватар из
          // курируемого набора в профиле. Google-фото кэшируем отдельно.
          googleAvatarUrl: profile.picture ?? null,
          emailVerified: true,
        },
      });
      return { ok: true, user: created };
    } catch (error) {
      if (isPublicCodeCollision(error)) continue;
      if (isEmailCollision(error)) return { ok: false, error: AUTH_ERROR.EMAIL_TAKEN };
      throw error;
    }
  }
  throw new Error('Could not allocate a unique publicCode after retries');
}

function isPublicCodeCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: string[] } | undefined)?.target;
  return Array.isArray(target) && target.includes('publicCode');
}

function isEmailCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: string[] } | undefined)?.target;
  return Array.isArray(target) && target.includes('email');
}
