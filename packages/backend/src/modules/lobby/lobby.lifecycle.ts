// Lobby module — TTL-based lifecycle: expire stale open lobbies.

import { prisma } from '../../db/prisma.client.js';

import { endActiveGameForLobby } from '../game/game.service.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { clearLobbyChat } from './lobby.chat.js';

// Лимит «времени жизни» открытого лобби. После этого порога ждущее лобби
// автоматически закрывается — чтобы оставленные/спам-лобби (которые юзер
// создал и забыл, или бот разместил «объявление» в названии) не висели
// бесконечно в листинге. Игры IN_GAME не трогаем — реальные партии могут
// идти долго и закрытие их через таймер сорвёт легитимных игроков.
export const LOBBY_OPEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Закрывает все WAITING-лобби старше LOBBY_OPEN_TTL_MS. Возвращает список
// закрытых id (чтобы вызывающий мог что-то с ними сделать — например, в
// тестах ассертить). На каждое закрытое лобби отправляем broadcast, чтобы
// у клиентов, висящих в листинге, оно пропало из UI.
export async function expireStaleLobbies(): Promise<string[]> {
  const cutoff = new Date(Date.now() - LOBBY_OPEN_TTL_MS);
  const stale = await prisma.lobby.findMany({
    where: { status: 'WAITING', createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return [];

  await prisma.lobby.updateMany({
    where: { id: { in: stale.map((l) => l.id) } },
    data: { status: 'CLOSED' },
  });

  for (const { id } of stale) {
    clearLobbyChat(id); // synchronous, in-memory
  }
  // Broadcast'ы параллельно — каждый дёргает Prisma findUnique.
  await Promise.allSettled(stale.map(({ id }) => broadcastLobbyUpdate(id)));
  return stale.map((l) => l.id);
}

// «Зомби-партия»: лобби в IN_GAME, привязанная игра не завершена
// (endedAt=null), но в журнале событий нет ни одного события свежее
// ZOMBIE_GAME_INACTIVITY_MS. Это игра, которая стартовала и была тут же
// брошена (все вышли, она не дошла до GAME_ENDED) — иначе фазовые переходы
// писали бы события. Свипер WAITING-лобби её не трогает (она IN_GAME), а
// сама она никогда не закроется. Чистим по НЕАКТИВНОСТИ, а не по возрасту:
// реальная долгая партия пишет события и под фильтр не попадёт.
export const ZOMBIE_GAME_INACTIVITY_MS = 3 * 60 * 60 * 1000; // 3 hours

// Завершает все зомби-партии и закрывает их лобби. Игру гасим БЕЗ
// finalizeStats — брошенная партия никого не штрафует поражением. Возвращает
// список закрытых lobby id.
export async function expireZombieGames(): Promise<string[]> {
  const cutoff = new Date(Date.now() - ZOMBIE_GAME_INACTIVITY_MS);
  const zombies = await prisma.lobby.findMany({
    where: {
      status: 'IN_GAME',
      game: {
        endedAt: null,
        events: { none: { createdAt: { gte: cutoff } } },
      },
    },
    select: { id: true },
  });
  if (zombies.length === 0) return [];

  // Гасим игру по одному лобби: endActiveGameForLobby ставит endedAt (после
  // этого recovery на буте её пропустит), чистит ботов и in-memory registry.
  for (const { id } of zombies) {
    await endActiveGameForLobby(id, { finalizeStats: false });
    clearLobbyChat(id);
  }

  await prisma.lobby.updateMany({
    where: { id: { in: zombies.map((l) => l.id) } },
    data: { status: 'CLOSED' },
  });

  await Promise.allSettled(zombies.map(({ id }) => broadcastLobbyUpdate(id)));
  return zombies.map((l) => l.id);
}
