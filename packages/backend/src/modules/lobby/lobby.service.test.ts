import { describe, expect, it, vi, beforeEach } from 'vitest';

// Pure unit tests for the lobby service barrel. Prisma, broadcasts, chat, the
// game service, password and moderation libs are all mocked — no DB, no
// network. Same style as club.service.test.ts.

vi.mock('../../db/prisma.client.js', () => {
  const prisma = {
    lobby: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    lobbyMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  return { prisma };
});

vi.mock('./lobby.broadcast.js', () => ({
  broadcastLobbyUpdate: vi.fn(async () => undefined),
}));

vi.mock('./lobby.chat.js', () => ({
  clearLobbyChat: vi.fn(),
}));

vi.mock('../game/game.service.js', () => ({
  endActiveGameForLobby: vi.fn(async () => undefined),
  removeUserFromActiveGameForLobby: vi.fn(async () => undefined),
}));

vi.mock('../../lib/password.js', () => ({
  hashPassword: vi.fn(async () => 'hashed-pw'),
  verifyPassword: vi.fn(async () => true),
}));

vi.mock('../../lib/moderation.js', () => ({
  moderateName: vi.fn(async () => ({ allowed: true as const })),
}));

import { prisma } from '../../db/prisma.client.js';
import { verifyPassword } from '../../lib/password.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { endActiveGameForLobby, removeUserFromActiveGameForLobby } from '../game/game.service.js';
import { setReady, joinLobby, kickMember, leaveLobby, expireZombieGames } from './lobby.service.js';

const mockedPrisma = vi.mocked(prisma, true);
const mockedVerify = vi.mocked(verifyPassword);
const mockedBroadcast = vi.mocked(broadcastLobbyUpdate);
const mockedEndGame = vi.mocked(endActiveGameForLobby);
const mockedRemoveUser = vi.mocked(removeUserFromActiveGameForLobby);

// A full lobby row in the shape getLobbyDetails / setReady's re-read expect
// (host + game + members-with-user). Used for happy-path responses.
function fullLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lobby-1',
    name: 'Table',
    isPrivate: false,
    hostId: 'host-1',
    rulesetSlug: 'classic',
    status: 'WAITING',
    createdAt: new Date(),
    passwordHash: null,
    host: { id: 'host-1', nickname: 'Host', publicCode: 'HOST01' },
    game: null,
    members: [
      {
        userId: 'host-1',
        seat: 1,
        isJudge: false,
        isReady: false,
        preassignedRole: null,
        user: {
          id: 'host-1',
          nickname: 'Host',
          publicCode: 'HOST01',
          avatarUrl: null,
          isBot: false,
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedVerify.mockResolvedValue(true);
  mockedBroadcast.mockResolvedValue(undefined);
  mockedEndGame.mockResolvedValue(undefined as never);
  mockedRemoveUser.mockResolvedValue(undefined as never);
  mockedPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(mockedPrisma),
  );
});

describe('setReady', () => {
  it('returns NOT_MEMBER when the caller has no membership', async () => {
    mockedPrisma.lobbyMember.findUnique.mockResolvedValue(null as never);

    const result = await setReady('lobby-1', 'ghost', true);

    expect(result).toEqual({ ok: false, error: 'not_member' });
    expect(mockedPrisma.lobbyMember.update).not.toHaveBeenCalled();
  });

  it('returns NOT_OPEN when the lobby is no longer WAITING (audit fix)', async () => {
    mockedPrisma.lobbyMember.findUnique.mockResolvedValue({
      userId: 'host-1',
      lobby: { status: 'IN_GAME' },
    } as never);

    const result = await setReady('lobby-1', 'host-1', true);

    expect(result).toEqual({ ok: false, error: 'lobby_not_open' });
    expect(mockedPrisma.lobbyMember.update).not.toHaveBeenCalled();
  });

  it('toggles the ready flag when the lobby is WAITING', async () => {
    mockedPrisma.lobbyMember.findUnique.mockResolvedValue({
      userId: 'host-1',
      lobby: { status: 'WAITING' },
    } as never);
    mockedPrisma.lobbyMember.update.mockResolvedValue({} as never);
    mockedPrisma.lobby.findUnique.mockResolvedValue(
      fullLobby({ members: [{ ...fullLobby().members[0], isReady: true }] }) as never,
    );

    const result = await setReady('lobby-1', 'host-1', true);

    expect(result.ok).toBe(true);
    expect(mockedPrisma.lobbyMember.update).toHaveBeenCalledWith({
      where: { lobbyId_userId: { lobbyId: 'lobby-1', userId: 'host-1' } },
      data: { isReady: true },
    });
    expect(mockedBroadcast).toHaveBeenCalledWith('lobby-1');
  });
});

describe('joinLobby', () => {
  const joinInput = {} as never;

  it('returns NOT_FOUND when the lobby does not exist', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue(null as never);

    const result = await joinLobby('missing', 'user-2', joinInput);

    expect(result).toEqual({ ok: false, error: 'lobby_not_found' });
  });

  it('returns NOT_OPEN when the lobby is IN_GAME', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      status: 'IN_GAME',
      isPrivate: false,
      passwordHash: null,
    } as never);

    const result = await joinLobby('lobby-1', 'user-2', joinInput);

    expect(result).toEqual({ ok: false, error: 'lobby_not_open' });
  });

  it('returns WRONG_PASSWORD for a private lobby with a bad password', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      status: 'WAITING',
      isPrivate: true,
      passwordHash: 'hashed-pw',
    } as never);
    mockedVerify.mockResolvedValue(false);

    const result = await joinLobby('lobby-1', 'user-2', { password: 'wrong' } as never);

    expect(result).toEqual({ ok: false, error: 'wrong_password' });
  });

  it('joins on the happy path and returns lobby details', async () => {
    // Outer existence/status read, then the re-read inside the txn, then the
    // members read, then getLobbyDetails' final read.
    mockedPrisma.lobby.findUnique
      .mockResolvedValueOnce({
        id: 'lobby-1',
        status: 'WAITING',
        isPrivate: false,
        passwordHash: null,
      } as never) // outer guard
      .mockResolvedValueOnce({ status: 'WAITING' } as never) // in-txn status re-read
      .mockResolvedValueOnce(fullLobby() as never); // getLobbyDetails after commit
    mockedPrisma.lobbyMember.findUnique.mockResolvedValue(null as never); // not already a member
    mockedPrisma.lobbyMember.findMany
      .mockResolvedValueOnce([] as never) // other WAITING memberships to evict
      .mockResolvedValueOnce([{ seat: 1, isJudge: false }] as never); // current members (seat 1 taken)
    mockedPrisma.lobbyMember.create.mockResolvedValue({} as never);

    const result = await joinLobby('lobby-1', 'user-2', joinInput);

    expect(result.ok).toBe(true);
    expect(mockedPrisma.lobbyMember.create).toHaveBeenCalledOnce();
    // New member should land in seat 2 (lowest free seat after seat 1).
    const createArg = mockedPrisma.lobbyMember.create.mock.calls[0]?.[0] as {
      data: { seat: number | null; isJudge: boolean };
    };
    expect(createArg.data.seat).toBe(2);
    expect(createArg.data.isJudge).toBe(false);
  });
});

describe('kickMember', () => {
  it('returns NOT_HOST when the caller is not the host', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
    } as never);

    const result = await kickMember('lobby-1', 'not-host', 'target-1');

    expect(result).toEqual({ ok: false, error: 'not_host' });
    expect(mockedPrisma.lobbyMember.delete).not.toHaveBeenCalled();
  });

  it('returns CANNOT_KICK_HOST when host tries to kick themselves', async () => {
    const result = await kickMember('lobby-1', 'host-1', 'host-1');

    expect(result).toEqual({ ok: false, error: 'cannot_kick_host' });
    expect(mockedPrisma.lobby.findUnique).not.toHaveBeenCalled();
  });

  it('kicks a member on the happy path', async () => {
    mockedPrisma.lobby.findUnique
      .mockResolvedValueOnce({ id: 'lobby-1', hostId: 'host-1' } as never) // host check
      .mockResolvedValueOnce(fullLobby() as never); // getLobbyDetails re-read
    mockedPrisma.lobbyMember.findUnique.mockResolvedValue({ userId: 'target-1' } as never);
    mockedPrisma.lobbyMember.delete.mockResolvedValue({} as never);

    const result = await kickMember('lobby-1', 'host-1', 'target-1');

    expect(result.ok).toBe(true);
    expect(mockedPrisma.lobbyMember.delete).toHaveBeenCalledWith({
      where: { lobbyId_userId: { lobbyId: 'lobby-1', userId: 'target-1' } },
    });
    expect(mockedBroadcast).toHaveBeenCalledWith('lobby-1');
  });
});

describe('leaveLobby', () => {
  it('returns NOT_MEMBER when the caller is not in the lobby', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      members: [{ userId: 'someone-else' }],
    } as never);

    const result = await leaveLobby('lobby-1', 'ghost');

    expect(result).toEqual({ ok: false, error: 'not_member' });
  });

  it('closes the lobby (and ends the game) when the host leaves', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      members: [{ userId: 'host-1' }, { userId: 'user-2' }],
    } as never);
    mockedPrisma.lobby.update.mockResolvedValue({} as never);

    const result = await leaveLobby('lobby-1', 'host-1');

    expect(result).toEqual({ ok: true, data: { closed: true } });
    expect(mockedPrisma.lobby.update).toHaveBeenCalledWith({
      where: { id: 'lobby-1' },
      data: { status: 'CLOSED' },
    });
    expect(mockedEndGame).toHaveBeenCalledWith('lobby-1');
  });

  it('removes a non-host member without closing the lobby', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      members: [{ userId: 'host-1' }, { userId: 'user-2' }],
    } as never);
    mockedPrisma.lobbyMember.delete.mockResolvedValue({} as never);

    const result = await leaveLobby('lobby-1', 'user-2');

    expect(result).toEqual({ ok: true, data: { closed: false } });
    expect(mockedPrisma.lobbyMember.delete).toHaveBeenCalledWith({
      where: { lobbyId_userId: { lobbyId: 'lobby-1', userId: 'user-2' } },
    });
    expect(mockedRemoveUser).toHaveBeenCalledWith('lobby-1', 'user-2');
    expect(mockedPrisma.lobby.update).not.toHaveBeenCalled();
  });
});

describe('expireZombieGames', () => {
  it('ends abandoned IN_GAME games without touching stats and closes their lobbies', async () => {
    mockedPrisma.lobby.findMany.mockResolvedValue([
      { id: 'zombie-1' },
      { id: 'zombie-2' },
    ] as never);

    const closed = await expireZombieGames();

    expect(closed).toEqual(['zombie-1', 'zombie-2']);
    // The game is ended WITHOUT finalizing stats — an abandoned game must not
    // penalize anyone with a loss.
    expect(mockedEndGame).toHaveBeenCalledWith('zombie-1', { finalizeStats: false });
    expect(mockedEndGame).toHaveBeenCalledWith('zombie-2', { finalizeStats: false });
    // Lobbies are flipped to CLOSED so they drop out of the listing.
    expect(mockedPrisma.lobby.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['zombie-1', 'zombie-2'] } },
      data: { status: 'CLOSED' },
    });
    expect(mockedBroadcast).toHaveBeenCalledWith('zombie-1');
    expect(mockedBroadcast).toHaveBeenCalledWith('zombie-2');
  });

  it('does nothing when there are no abandoned games', async () => {
    mockedPrisma.lobby.findMany.mockResolvedValue([] as never);

    const closed = await expireZombieGames();

    expect(closed).toEqual([]);
    expect(mockedEndGame).not.toHaveBeenCalled();
    expect(mockedPrisma.lobby.updateMany).not.toHaveBeenCalled();
  });
});
