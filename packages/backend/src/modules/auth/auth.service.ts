// Business logic of the authentication module.
//
// All Prisma calls and password operations live here, isolated from route handlers.
// Route handlers translate HTTP <-> service calls and have no business logic of their own.

import { randomBytes } from 'node:crypto';

import { Prisma } from '@prisma/client';
import type {
  AuthenticatedUser,
  LoginInput,
  PublicUserProfile,
  RegisterInput,
  UpdateProfileInput,
} from '@mafia/shared';
import type { User } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { refreshUserInActiveGames } from '../game/game.broadcast.js';
import { broadcastLobbiesContainingUser } from '../lobby/lobby.broadcast.js';

import type { GoogleUserInfo } from './google.js';

// Reasons returned by auth operations. Routes translate these to HTTP status codes.
export const AUTH_ERROR = {
  EMAIL_TAKEN: 'email_taken',
  NICKNAME_TAKEN: 'nickname_taken',
  NICKNAME_REJECTED: 'nickname_rejected',
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
    publicCode: user.publicCode,
    avatarUrl: user.avatarUrl ?? null,
    googleAvatarUrl: user.googleAvatarUrl ?? null,
    realName: user.realName ?? null,
    country: user.country ?? null,
    clubName: user.clubName ?? null,
    hasPassword: Boolean(user.passwordHash),
  };
}

/** Public projection — no email exposed. */
export function toPublicUserProfile(user: User): PublicUserProfile {
  return {
    id: user.id,
    publicCode: user.publicCode,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl ?? null,
    realName: user.realName ?? null,
    country: user.country ?? null,
    clubName: user.clubName ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// Generate a fresh 6-character uppercase alphanumeric code (A-Z 0-9) that
// is not yet taken in the User table. Retries on collision a few times,
// then throws — collisions are astronomically rare at this scale.
const PUBLIC_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const PUBLIC_CODE_LENGTH = 6;
function randomPublicCode(): string {
  const bytes = randomBytes(PUBLIC_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i += 1) {
    out += PUBLIC_CODE_ALPHABET[bytes[i]! % PUBLIC_CODE_ALPHABET.length];
  }
  return out;
}
async function allocatePublicCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomPublicCode();
    const taken = await prisma.user.findUnique({
      where: { publicCode: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error('Could not allocate a unique publicCode after 10 attempts');
}

export async function registerWithPassword(input: RegisterInput): Promise<AuthResult> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedNickname = input.nickname.trim();

  // Email must still be unique. Nicknames are no longer constrained.
  const emailTaken = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (emailTaken) return { ok: false, error: AUTH_ERROR.EMAIL_TAKEN };

  // AI-moderate the nickname before we hash the password — argon2 is the most
  // expensive step here, no point burning it on a name we're about to reject.
  const verdict = await moderateName(normalizedNickname, 'nickname');
  if (!verdict.allowed) return { ok: false, error: AUTH_ERROR.NICKNAME_REJECTED };

  const passwordHash = await hashPassword(input.password);

  // Retry loop handles the rare case where two registrations collide on publicCode
  // or email (concurrent requests that both pass the findUnique check above).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = await allocatePublicCode();
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
  void broadcastLobbiesContainingUser(userId);
  refreshUserInActiveGames(userId, { nickname: normalized });
  return { ok: true, user: updated };
}

// Update optional public-profile fields. Each field independently: undefined
// means "leave alone", null means "clear". Strings are trimmed; an empty
// string after trim is also treated as "clear" so blank textboxes do what
// users expect.
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
    clubName?: string | null;
    avatarUrl?: string | null;
  } = {};
  if (input.realName !== undefined) data.realName = norm(input.realName) ?? null;
  if (input.country !== undefined) data.country = norm(input.country) ?? null;
  if (input.clubName !== undefined) data.clubName = norm(input.clubName) ?? null;
  if (input.avatarId !== undefined) {
    if (input.avatarId === 'google') {
      // Resolve the sentinel to the user's cached Google photo URL. If we
      // don't have one cached the request silently no-ops on this field —
      // the client should only offer "google" when googleAvatarUrl is set.
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { googleAvatarUrl: true },
      });
      if (current?.googleAvatarUrl) data.avatarUrl = current.googleAvatarUrl;
    } else {
      // Standard avatar ID stored directly; null clears the avatar.
      data.avatarUrl = input.avatarId;
    }
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  // If the avatar changed, push the new snapshot to the user's lobby and
  // active game so other connected sockets see it without reloading.
  if (data.avatarUrl !== undefined) {
    void broadcastLobbiesContainingUser(userId);
    refreshUserInActiveGames(userId, { avatarUrl: updated.avatarUrl });
  }
  return { ok: true, user: updated };
}

// Public profile lookup by short code. Case-insensitive: the URL slug may
// arrive lowercased but codes are stored uppercase.
export async function findUserByPublicCode(code: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { publicCode: code.trim().toUpperCase() } });
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
        clubName: null,
        tokenVersion: { increment: 1 },
      },
    });
  });
  return { ok: true, user: anonymised };
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
  if (byGoogleId) {
    // Refresh cached Google photo on every sign-in. If the user is currently
    // showing their Google avatar (avatarUrl equals the previously-cached
    // googleAvatarUrl, or avatarUrl is null), follow Google's new URL too.
    const newGooglePhoto = profile.picture ?? null;
    const followsGoogle =
      byGoogleId.avatarUrl === null ||
      (byGoogleId.googleAvatarUrl !== null && byGoogleId.avatarUrl === byGoogleId.googleAvatarUrl);
    if (newGooglePhoto !== byGoogleId.googleAvatarUrl) {
      const refreshed = await prisma.user.update({
        where: { id: byGoogleId.id },
        data: {
          googleAvatarUrl: newGooglePhoto,
          ...(followsGoogle ? { avatarUrl: newGooglePhoto } : {}),
        },
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
        // Always refresh the cached Google photo so users can restore it later.
        googleAvatarUrl: profile.picture ?? null,
        // Only seed avatarUrl from Google if it was empty — don't override an
        // explicit standard avatar the user already picked.
        avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
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
    const publicCode = await allocatePublicCode();
    try {
      const created = await prisma.user.create({
        data: {
          email: normalizedEmail,
          nickname,
          publicCode,
          googleId: profile.sub,
          avatarUrl: profile.picture ?? null,
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
