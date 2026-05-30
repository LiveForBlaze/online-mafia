import { describe, expect, it, vi, beforeEach } from 'vitest';

// Pure unit tests for the auth user service. Prisma, moderation, password and
// public-code libs are mocked so no DB / argon2 work happens — same pattern as
// club.service.test.ts.

vi.mock('../../db/prisma.client.js', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock('../../lib/moderation.js', () => ({
  moderateName: vi.fn(async () => ({ allowed: true as const })),
}));

vi.mock('../../lib/password.js', () => ({
  hashPassword: vi.fn(async () => 'hashed-pw'),
  verifyPassword: vi.fn(async () => true),
}));

vi.mock('../../lib/public-code.js', () => ({
  // The real allocatePublicCode takes an `isTaken` predicate; our stub ignores
  // it and just hands back a fixed code so registration doesn't loop.
  allocatePublicCode: vi.fn(async () => 'PUB123'),
}));

import { Prisma } from '@prisma/client';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { verifyPassword } from '../../lib/password.js';
import {
  registerWithPassword,
  loginWithPassword,
  findOrCreateUserFromGoogle,
} from './auth.service.js';

const mockedPrisma = vi.mocked(prisma, true);
const mockedModerate = vi.mocked(moderateName);
const mockedVerify = vi.mocked(verifyPassword);

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'a@b.com',
    nickname: 'Alice',
    publicCode: 'PUB123',
    passwordHash: 'hashed-pw',
    googleId: null,
    googleAvatarUrl: null,
    avatarUrl: null,
    emailVerified: false,
    isBot: false,
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedModerate.mockResolvedValue({ allowed: true } as never);
  mockedVerify.mockResolvedValue(true);
});

describe('registerWithPassword', () => {
  const input = { email: 'A@B.com ', nickname: ' Alice ', password: 'secret-password' };

  it('creates the user on the happy path', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null as never); // email free + publicCode free
    mockedPrisma.user.create.mockResolvedValue(makeUser() as never);

    const result = await registerWithPassword(input as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.nickname).toBe('Alice');
    expect(mockedPrisma.user.create).toHaveBeenCalledOnce();
    // Email was normalized (lowercased + trimmed) before insert.
    const createArg = mockedPrisma.user.create.mock.calls[0]?.[0] as {
      data: { email: string; nickname: string };
    };
    expect(createArg.data.email).toBe('a@b.com');
    expect(createArg.data.nickname).toBe('Alice');
  });

  it('rejects a nickname the moderator disallows', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null as never);
    mockedModerate.mockResolvedValue({ allowed: false, reason: 'nope' } as never);

    const result = await registerWithPassword(input as never);

    expect(result).toEqual({ ok: false, error: 'nickname_rejected' });
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it('returns EMAIL_TAKEN whether caught early or on the create P2002', async () => {
    // Robust across a refactor: set up BOTH the early existence-check hit AND a
    // create() that throws a P2002 email collision. Either branch must yield
    // EMAIL_TAKEN.
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'existing' } as never);
    mockedPrisma.user.create.mockRejectedValue(p2002(['email']));

    const result = await registerWithPassword(input as never);

    expect(result).toEqual({ ok: false, error: 'email_taken' });
  });
});

describe('loginWithPassword', () => {
  const input = { email: 'a@b.com', password: 'secret-password' };

  it('returns INVALID_CREDENTIALS for an unknown email', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null as never);

    const result = await loginWithPassword(input as never);

    expect(result).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(mockedVerify).not.toHaveBeenCalled();
  });

  it('returns PASSWORD_NOT_SET when the user has no passwordHash (OAuth-only)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: null }) as never);

    const result = await loginWithPassword(input as never);

    expect(result).toEqual({ ok: false, error: 'password_not_set' });
  });

  it('returns INVALID_CREDENTIALS on a wrong password', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(makeUser() as never);
    mockedVerify.mockResolvedValue(false);

    const result = await loginWithPassword(input as never);

    expect(result).toEqual({ ok: false, error: 'invalid_credentials' });
  });

  it('logs the user in on a correct password', async () => {
    const user = makeUser();
    mockedPrisma.user.findUnique.mockResolvedValue(user as never);
    mockedVerify.mockResolvedValue(true);

    const result = await loginWithPassword(input as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('user-1');
  });
});

describe('findOrCreateUserFromGoogle', () => {
  const baseProfile = {
    sub: 'google-sub-1',
    email: 'a@b.com',
    email_verified: true,
    name: 'Alice',
    picture: 'https://pic',
  };

  it('refuses an unverified Google email', async () => {
    const result = await findOrCreateUserFromGoogle({
      ...baseProfile,
      email_verified: false,
    } as never);

    expect(result).toEqual({ ok: false, error: 'oauth_email_not_verified' });
    expect(mockedPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('logs in an existing user matched by googleId', async () => {
    // googleId lookup hits; googleAvatarUrl already current so no update call.
    const existing = makeUser({
      id: 'g-user',
      googleId: 'google-sub-1',
      googleAvatarUrl: 'https://pic',
    });
    mockedPrisma.user.findUnique.mockResolvedValueOnce(existing as never);

    const result = await findOrCreateUserFromGoogle(baseProfile as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('g-user');
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to link onto a password account with an unverified email', async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null as never) // no googleId match
      .mockResolvedValueOnce(makeUser({ passwordHash: 'x', emailVerified: false }) as never); // by email

    const result = await findOrCreateUserFromGoogle(baseProfile as never);

    expect(result).toEqual({ ok: false, error: 'oauth_link_refused' });
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });

  it('creates a new user when nothing matches', async () => {
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null as never) // no googleId
      .mockResolvedValueOnce(null as never) // no email
      .mockResolvedValue(null as never); // publicCode free in allocate loop
    const created = makeUser({ id: 'new-user', googleId: 'google-sub-1', emailVerified: true });
    mockedPrisma.user.create.mockResolvedValue(created as never);

    const result = await findOrCreateUserFromGoogle(baseProfile as never);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('new-user');
    expect(mockedPrisma.user.create).toHaveBeenCalledOnce();
  });
});
