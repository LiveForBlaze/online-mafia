// Bot user creation and bulk-fill for a lobby.
//
// Bots are real `User` rows with `isBot: true`. They never log in or own a session;
// the server performs actions on their behalf (see ../game/game.bots.ts).
//
// Lobby host can fill remaining player slots with one click — useful when you want to
// test the full 10-player flow without recruiting friends.

import { GAME, LOBBY } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { LOBBY_ERROR, type LobbyErrorCode } from './lobby.errors.js';

interface FillBotsSuccess {
  ok: true;
  added: number;
}
interface FillBotsFailure {
  ok: false;
  error: LobbyErrorCode;
}
export type FillBotsResult = FillBotsSuccess | FillBotsFailure;

// Russian-ish bot names so they read naturally next to real player nicknames.
const BOT_NAME_POOL = [
  'Алекс',
  'Боря',
  'Витя',
  'Гена',
  'Дима',
  'Егор',
  'Жора',
  'Ваня',
  'Костя',
  'Лёва',
  'Миша',
  'Назар',
  'Олег',
  'Паша',
  'Рома',
  'Стас',
  'Тимур',
  'Федя',
  'Юра',
  'Ярик',
];

function pickBotName(): string {
  const base = BOT_NAME_POOL[Math.floor(Math.random() * BOT_NAME_POOL.length)] ?? 'Bot';
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `🤖 ${base}-${suffix}`;
}

/** Generate a synthetic email for the bot. Must be unique. */
function botEmail(nickname: string): string {
  const slug = nickname.replace(/[^A-Za-zА-Яа-я0-9]+/g, '').toLowerCase();
  return `${slug}-${Date.now()}-${Math.floor(Math.random() * 1000)}@bot.local`;
}

/** Generate a short uppercase alphanumeric publicCode for a bot. */
const BOT_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
async function allocateBotPublicCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += BOT_CODE_ALPHABET[Math.floor(Math.random() * BOT_CODE_ALPHABET.length)];
    }
    const taken = await prisma.user.findUnique({
      where: { publicCode: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error('Could not allocate a unique publicCode for a bot');
}

/** Create one bot User row. Nicknames are no longer unique, so no retry needed. */
async function createBot() {
  const nickname = pickBotName();
  return prisma.user.create({
    data: {
      email: botEmail(nickname),
      nickname,
      publicCode: await allocateBotPublicCode(),
      isBot: true,
      passwordHash: null,
    },
  });
}

/**
 * Fill empty player seats with bots. The judge slot is never auto-filled —
 * judges remain human-only for V0.
 */
export async function fillLobbyWithBots(
  lobbyId: string,
  requesterUserId: string,
): Promise<FillBotsResult> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    select: {
      id: true,
      hostId: true,
      status: true,
      members: { select: { seat: true, isJudge: true } },
    },
  });
  if (!lobby) return { ok: false, error: LOBBY_ERROR.NOT_FOUND };
  if (lobby.hostId !== requesterUserId) return { ok: false, error: LOBBY_ERROR.NOT_HOST };
  if (lobby.status !== 'WAITING') return { ok: false, error: LOBBY_ERROR.NOT_OPEN };

  const takenSeats = new Set(
    lobby.members.filter((m) => !m.isJudge && m.seat !== null).map((m) => m.seat as number),
  );
  const emptySeats: number[] = [];
  for (let seat = GAME.FIRST_SEAT; seat <= GAME.LAST_SEAT; seat += 1) {
    if (!takenSeats.has(seat)) emptySeats.push(seat);
  }

  if (emptySeats.length === 0) return { ok: true, added: 0 };

  // Create bots one by one — small N, race-free. Each goes into a specific seat.
  let added = 0;
  for (const seat of emptySeats) {
    const bot = await createBot();
    try {
      await prisma.lobbyMember.create({
        data: {
          lobbyId,
          userId: bot.id,
          seat,
          isJudge: false,
          // Bots have no UI — flip them ready immediately so they're not
          // the reason the host's start button stays disabled.
          isReady: true,
        },
      });
      added += 1;
    } catch {
      // Lobby was modified concurrently; stop adding and return what we managed.
      break;
    }
  }
  void LOBBY;
  if (added > 0) void broadcastLobbyUpdate(lobbyId);
  return { ok: true, added };
}
