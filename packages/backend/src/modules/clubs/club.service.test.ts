import { describe, expect, it, vi, beforeEach } from 'vitest';

// Service under test. We mock the prisma client and moderation lib so the
// test stays a pure unit test (no DB needed) — same pattern as
// moderation-prefilter.test.ts.

vi.mock('../../db/prisma.client.js', () => {
  const prisma = {
    club: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    clubMember: {
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    clubJoinRequest: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: { update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  };
  return { prisma };
});

vi.mock('../../lib/moderation.js', () => ({
  moderateName: vi.fn(async () => ({ allowed: true as const })),
}));

vi.mock('../../lib/public-code.js', () => ({
  allocatePublicCode: vi.fn(async () => 'ABC123'),
}));

import { prisma } from '../../db/prisma.client.js';
import { createClub, leaveClub } from './club.service.js';

const mockedPrisma = vi.mocked(prisma, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createClub', () => {
  it('creates club + makes creator the head and first member', async () => {
    // user is under MAX_CLUBS_PER_USER (=3) — count returns 0
    mockedPrisma.clubMember.count.mockResolvedValue(0);
    mockedPrisma.club.create.mockResolvedValue({
      id: 'club-1',
      name: 'Demo',
      publicCode: 'ABC123',
      headId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    mockedPrisma.clubMember.create.mockResolvedValue({} as never);
    // getClubByCode lookup after creation
    mockedPrisma.club.findUnique.mockResolvedValue({
      id: 'club-1',
      name: 'Demo',
      publicCode: 'ABC123',
      headId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      members: [],
      joinRequests: [],
    } as never);

    const result = await createClub('user-1', 'Demo');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.headId).toBe('user-1');
      expect(result.data.publicCode).toBe('ABC123');
    }
    expect(mockedPrisma.club.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.clubMember.create).toHaveBeenCalledWith({
      data: { clubId: 'club-1', userId: 'user-1' },
    });
  });
});

describe('leaveClub as head', () => {
  it('auto-transfers leadership to the oldest non-leaving member', async () => {
    mockedPrisma.club.findUnique.mockResolvedValueOnce({
      id: 'club-1',
      headId: 'user-1',
      members: [
        { userId: 'user-1', joinedAt: new Date('2024-01-01') },
        { userId: 'user-2', joinedAt: new Date('2024-02-01') },
        { userId: 'user-3', joinedAt: new Date('2024-03-01') },
      ],
    } as never);
    mockedPrisma.club.update.mockResolvedValue({} as never);
    mockedPrisma.clubMember.delete.mockResolvedValue({} as never);
    mockedPrisma.user.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await leaveClub('ABC123', 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.disbanded).toBe(false);
      expect(result.data.newHeadId).toBe('user-2');
    }
    expect(mockedPrisma.club.update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { headId: 'user-2' },
    });
  });

  it('disbands the club when the head is the only member', async () => {
    mockedPrisma.club.findUnique.mockResolvedValueOnce({
      id: 'club-1',
      headId: 'user-1',
      members: [{ userId: 'user-1', joinedAt: new Date('2024-01-01') }],
    } as never);
    mockedPrisma.club.delete.mockResolvedValue({} as never);

    const result = await leaveClub('ABC123', 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.disbanded).toBe(true);
      expect(result.data.newHeadId).toBeNull();
    }
    expect(mockedPrisma.club.delete).toHaveBeenCalledWith({ where: { id: 'club-1' } });
  });
});
