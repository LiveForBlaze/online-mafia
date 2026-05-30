import { describe, expect, it, vi, beforeEach } from 'vitest';

// Pure unit tests for fillLobbyWithBots. Prisma and the broadcast helper are
// mocked — no DB, no sockets. Same style as club.service.test.ts.

vi.mock('../../db/prisma.client.js', () => {
  const prisma = {
    lobby: {
      findUnique: vi.fn(),
    },
    lobbyMember: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  return { prisma };
});

vi.mock('./lobby.broadcast.js', () => ({
  broadcastLobbyUpdate: vi.fn(async () => undefined),
}));

import { prisma } from '../../db/prisma.client.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { fillLobbyWithBots } from './lobby.bots.js';

const mockedPrisma = vi.mocked(prisma, true);
const mockedBroadcast = vi.mocked(broadcastLobbyUpdate);

let botSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  botSeq = 0;
  mockedBroadcast.mockResolvedValue(undefined);
  // createBot allocates a publicCode: user.findUnique must say "free".
  mockedPrisma.user.findUnique.mockResolvedValue(null as never);
  mockedPrisma.user.create.mockImplementation(async () => {
    botSeq += 1;
    return { id: `bot-${botSeq}`, isBot: true } as never;
  });
  mockedPrisma.lobbyMember.create.mockResolvedValue({} as never);
});

describe('fillLobbyWithBots', () => {
  it('returns NOT_FOUND when the lobby is missing', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue(null as never);

    const result = await fillLobbyWithBots('missing', 'host-1');

    expect(result).toEqual({ ok: false, error: 'lobby_not_found' });
    expect(mockedPrisma.lobbyMember.create).not.toHaveBeenCalled();
  });

  it('returns NOT_HOST when the requester is not the host', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      status: 'WAITING',
      members: [],
    } as never);

    const result = await fillLobbyWithBots('lobby-1', 'someone-else');

    expect(result).toEqual({ ok: false, error: 'not_host' });
    expect(mockedPrisma.lobbyMember.create).not.toHaveBeenCalled();
  });

  it('returns NOT_OPEN when the lobby is not WAITING', async () => {
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      status: 'IN_GAME',
      members: [],
    } as never);

    const result = await fillLobbyWithBots('lobby-1', 'host-1');

    expect(result).toEqual({ ok: false, error: 'lobby_not_open' });
    expect(mockedPrisma.lobbyMember.create).not.toHaveBeenCalled();
  });

  it('returns added=0 when every player seat is already taken', async () => {
    const members = [];
    for (let seat = 1; seat <= 10; seat += 1) {
      members.push({ seat, isJudge: false });
    }
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      status: 'WAITING',
      members,
    } as never);

    const result = await fillLobbyWithBots('lobby-1', 'host-1');

    expect(result).toEqual({ ok: true, added: 0 });
    expect(mockedPrisma.lobbyMember.create).not.toHaveBeenCalled();
    expect(mockedBroadcast).not.toHaveBeenCalled();
  });

  it('fills all empty seats with bots on the happy path', async () => {
    // Seat 1 taken by the host; the judge slot is occupied by a separate row
    // (seat=null, isJudge=true) and must NOT be counted as a player seat.
    mockedPrisma.lobby.findUnique.mockResolvedValue({
      id: 'lobby-1',
      hostId: 'host-1',
      status: 'WAITING',
      members: [
        { seat: 1, isJudge: false },
        { seat: null, isJudge: true },
      ],
    } as never);

    const result = await fillLobbyWithBots('lobby-1', 'host-1');

    // Seats 2..10 are empty -> 9 bots added.
    expect(result).toEqual({ ok: true, added: 9 });
    expect(mockedPrisma.lobbyMember.create).toHaveBeenCalledTimes(9);
    expect(mockedPrisma.user.create).toHaveBeenCalledTimes(9);

    // Each bot is seeded ready and seated into one of the empty seats.
    const seatsFilled = mockedPrisma.lobbyMember.create.mock.calls.map(
      (call) => (call[0] as { data: { seat: number; isReady: boolean } }).data,
    );
    expect(seatsFilled.every((d) => d.isReady === true)).toBe(true);
    expect(seatsFilled.map((d) => d.seat).sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(mockedBroadcast).toHaveBeenCalledWith('lobby-1');
  });
});
