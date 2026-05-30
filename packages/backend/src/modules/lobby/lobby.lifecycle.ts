// Lobby module — TTL-based lifecycle: expire stale open lobbies.

import { prisma } from '../../db/prisma.client.js';

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
