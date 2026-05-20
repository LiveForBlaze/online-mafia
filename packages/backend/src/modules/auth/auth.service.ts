// Business logic of the authentication module.
//
// All Prisma calls and password operations live here, isolated from route handlers.
// Route handlers translate HTTP <-> service calls and have no business logic of their own.

import type { AuthenticatedUser, LoginInput, RegisterInput } from '@mafia/shared';
import type { User } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

import type { GoogleUserInfo } from './google.js';

// Reasons returned by auth operations. Routes translate these to HTTP status codes.
export const AUTH_ERROR = {
  EMAIL_TAKEN: 'email_taken',
  NICKNAME_TAKEN: 'nickname_taken',
  INVALID_CREDENTIALS: 'invalid_credentials',
  PASSWORD_NOT_SET: 'password_not_set',
  OAUTH_LINK_REFUSED: 'oauth_link_refused',
  OAUTH_EMAIL_NOT_VERIFIED: 'oauth_email_not_verified',
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

/** Strip private fields before sending a user object to the client. */
export function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
  };
}

export async function registerWithPassword(input: RegisterInput): Promise<AuthResult> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedNickname = input.nickname.trim();

  // Check for collisions explicitly so we can return a clear error code,
  // instead of relying on Prisma's generic P2002 unique-constraint exception.
  const [emailTaken, nicknameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
    prisma.user.findUnique({ where: { nickname: normalizedNickname }, select: { id: true } }),
  ]);
  if (emailTaken) return { ok: false, error: AUTH_ERROR.EMAIL_TAKEN };
  if (nicknameTaken) return { ok: false, error: AUTH_ERROR.NICKNAME_TAKEN };

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      nickname: normalizedNickname,
      passwordHash,
    },
  });

  return { ok: true, user };
}

export async function updateNickname(userId: string, nickname: string): Promise<AuthResult> {
  const normalized = nickname.trim();

  // Allow setting to the same nickname (no-op from the user's POV) without a 409.
  const existing = await prisma.user.findUnique({
    where: { nickname: normalized },
    select: { id: true },
  });
  if (existing && existing.id !== userId) {
    return { ok: false, error: AUTH_ERROR.NICKNAME_TAKEN };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { nickname: normalized },
  });
  return { ok: true, user: updated };
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
  if (byGoogleId) return { ok: true, user: byGoogleId };

  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (byEmail) {
    // Existing local account has a password but never proved control of the email.
    // Pre-account-takeover protection: refuse the link.
    if (byEmail.passwordHash && !byEmail.emailVerified) {
      return { ok: false, error: AUTH_ERROR.OAUTH_LINK_REFUSED };
    }
    // Safe to link: either the local account was already verified, or it has no
    // password (created earlier via a different OAuth provider).
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        googleId: profile.sub,
        // Once linked to a verified Google account, mark email as verified.
        emailVerified: true,
        avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
      },
    });
    return { ok: true, user: updated };
  }

  const created = await prisma.user.create({
    data: {
      email: normalizedEmail,
      nickname: await suggestUniqueNickname(profile.name ?? normalizedEmail.split('@')[0] ?? 'user'),
      googleId: profile.sub,
      avatarUrl: profile.picture ?? null,
      // Google verified the email for us — no separate verification flow needed.
      emailVerified: true,
    },
  });
  return { ok: true, user: created };
}

/**
 * Suggest a nickname that does not collide with anyone else.
 * If "alice" is taken, try "alice-2", then "alice-3", and so on.
 * Falls back to a random suffix after a few attempts to keep this bounded.
 */
async function suggestUniqueNickname(seed: string): Promise<string> {
  const base = seed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16) || 'player';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const exists = await prisma.user.findUnique({
      where: { nickname: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }

  const randomSuffix = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${base}-${randomSuffix}`;
}
