// Lobby module — read/query operations and home-page stats.

import { type LobbyDetails, type LobbySummary } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import { LOBBY_ERROR } from './lobby.errors.js';
import { toLobbyDetails, toLobbySummary } from './lobby.mappers.js';
import { ok, fail, type ServiceResult } from './lobby.service.internal.js';

// Lobbies that the viewer is a member of and whose game is in progress.
// Used to render the "active games" section on the lobby list page so a host
// who navigates away from an in-progress game can find their way back.
export async function listUserActiveLobbies(viewerUserId: string): Promise<LobbySummary[]> {
  const rows = await prisma.lobby.findMany({
    where: {
      status: 'IN_GAME',
      members: { some: { userId: viewerUserId } },
    },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      // Подсчитываем только игроков (без судьи) — счётчик на фронте
      // показывает «N/10 игроков».
      _count: { select: { members: { where: { isJudge: false } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, true));
}

// Public list of in-progress games for the home page. По жалобе #1 «не
// видно активных игр»: предыдущий /active возвращал ТОЛЬКО лобби, где
// viewer состоит, и для зрителей со стороны была пустота. Этот вариант
// показывает все НЕприватные IN_GAME лобби с хостом-человеком, чтобы
// пользователь мог увидеть какие партии сейчас идут.
export async function listLiveGames(viewerUserId: string): Promise<LobbySummary[]> {
  const rows = await prisma.lobby.findMany({
    where: {
      isPrivate: false,
      status: 'IN_GAME',
      host: { isBot: false },
    },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      _count: { select: { members: { where: { isJudge: false } } } },
      members: {
        where: { userId: viewerUserId },
        select: { userId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, row.members.length > 0));
}

export async function listPublicLobbies(viewerUserId: string): Promise<LobbySummary[]> {
  // Fetch the `members` relation filtered to the viewer's row only — that way we know
  // membership per lobby without loading every member in the result set.
  // host.isBot=false guards against orphaned lobbies created by older code that
  // transferred hostship to a bot when the original host left.
  const rows = await prisma.lobby.findMany({
    where: {
      isPrivate: false,
      status: 'WAITING',
      host: { isBot: false },
    },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      // Счётчик игроков без судьи (см. listUserActiveLobbies).
      _count: { select: { members: { where: { isJudge: false } } } },
      members: {
        where: { userId: viewerUserId },
        select: { userId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return rows.map((row) => toLobbySummary(row, row._count.members, row.members.length > 0));
}

export async function getLobbyDetails(
  lobbyId: string,
  viewerUserId: string,
): Promise<ServiceResult<LobbyDetails>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      host: { select: { id: true, nickname: true, publicCode: true } },
      game: { select: { id: true } },
      members: {
        include: {
          user: {
            select: { id: true, nickname: true, publicCode: true, avatarUrl: true, isBot: true },
          },
        },
        orderBy: [{ isJudge: 'desc' }, { seat: 'asc' }],
      },
    },
  });

  if (!lobby) return fail(LOBBY_ERROR.NOT_FOUND);
  return ok(toLobbyDetails(lobby, viewerUserId));
}

// Агрегированная статистика для лендинга:
//   openLobbies — сколько лобби в статусе WAITING (открытых для входа)
//   activeGames — сколько партий идёт прямо сейчас (Game.endedAt IS NULL)
//
// Не кэшируем — каждое значение делается одним count'ом, для 100 лобби это
// миллисекунды. На клиенте react-query держит staleTime 30s, чтобы не дёргать
// при каждом рендере хедера.
export interface HomeStats {
  openLobbies: number;
  activeGames: number;
}

export async function getHomeStats(): Promise<HomeStats> {
  const [openLobbies, activeGames] = await Promise.all([
    prisma.lobby.count({
      where: { status: 'WAITING' },
    }),
    // Считаем игру «активной» по СОВПАДЕНИЮ двух источников: у Game нет
    // endedAt И связанное Lobby в статусе IN_GAME. Один только endedAt=null
    // ловит зомби-партии: бэкенд крэшнулся между revert и финализацией,
    // или хост закрыл лобби, а GAME_ENDED не записался. Lobby.status —
    // источник правды о том, идёт ли реально партия за этим столом.
    prisma.game.count({
      where: {
        endedAt: null,
        lobby: { status: 'IN_GAME' },
      },
    }),
  ]);
  return { openLobbies, activeGames };
}
