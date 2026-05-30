// Lobby module — lobby creation.
//
// Concurrency: a partial unique index (Lobby_hostId_active_unique) plus an
// upfront findFirst guard enforce "one active lobby per host". Stale guest
// memberships are evicted before the new lobby is created.

import { Prisma } from '@prisma/client';
import {
  DEFAULT_RULESET_SLUG,
  GAME,
  MEMBER_ROLE,
  type CreateLobbyInput,
  type LobbyDetails,
} from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { moderateName } from '../../lib/moderation.js';
import { hashPassword } from '../../lib/password.js';
import { removeUserFromActiveGameForLobby } from '../game/game.service.js';

import { LOBBY_ERROR } from './lobby.errors.js';
import { broadcastLobbyUpdate } from './lobby.broadcast.js';
import { toLobbyDetails } from './lobby.mappers.js';
import { ok, fail, type ServiceResult } from './lobby.service.internal.js';

export async function createLobby(
  hostId: string,
  input: CreateLobbyInput,
): Promise<ServiceResult<LobbyDetails>> {
  // Один пользователь = одно активное лобби (WAITING или IN_GAME).
  // Чтобы хост не разбрасывал десятки лобби (видно было в проде: один юзер
  // создал 7 параллельных открытых). Проверяем ДО модерации — нет смысла
  // жечь Haiku если всё равно отклоним по лимиту.
  const existingActive = await prisma.lobby.findFirst({
    where: {
      hostId,
      status: { in: ['WAITING', 'IN_GAME'] },
    },
    select: { id: true },
  });
  if (existingActive) {
    return fail(LOBBY_ERROR.HOST_HAS_ACTIVE_LOBBY);
  }

  // AI-moderate the name before we touch the DB. Cheap (~$0.0003 per call) and
  // fails open if the moderation service is down — see lib/moderation.ts.
  const verdict = await moderateName(input.name, 'lobby');
  if (!verdict.allowed) {
    return fail(LOBBY_ERROR.NAME_REJECTED);
  }

  // Один пользователь = одно WAITING-лобби. До создания нового —
  // выкидываем себя из всех старых, где сейчас числимся гостем (не host).
  // Та же логика что в joinLobby — без неё пользователь, который не
  // явным leave вышел из чужого лобби (закрыл вкладку, ушёл через лого),
  // оставался там «призраком» когда создавал своё.
  const stalePlayerMemberships = await prisma.lobbyMember.findMany({
    where: {
      userId: hostId,
      lobby: { status: 'WAITING', hostId: { not: hostId } },
    },
    select: { lobbyId: true },
  });
  if (stalePlayerMemberships.length > 0) {
    await prisma.lobbyMember.deleteMany({
      where: {
        userId: hostId,
        lobbyId: { in: stalePlayerMemberships.map((m) => m.lobbyId) },
      },
    });
    // Чистка может застать гонку: лобби в момент SELECT было WAITING, но
    // успело перейти в IN_GAME до DELETE. LobbyMember уже удалён, а
    // GameParticipant остался — юзер становится «фантомом» в играющей
    // партии. removeUserFromActiveGameForLobby делает no-op если игры нет,
    // иначе помечает участника removed и пушит обновлённый state. Параллельно.
    await Promise.allSettled(
      stalePlayerMemberships.flatMap(({ lobbyId: oldId }) => [
        broadcastLobbyUpdate(oldId),
        removeUserFromActiveGameForLobby(oldId, hostId),
      ]),
    );
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const hostAsJudge = input.hostRole === MEMBER_ROLE.JUDGE;

  let lobby;
  try {
    lobby = await prisma.lobby.create({
      data: {
        name: input.name,
        isPrivate: input.isPrivate,
        passwordHash,
        hostId,
        rulesetSlug: DEFAULT_RULESET_SLUG,
        members: {
          create: {
            userId: hostId,
            seat: hostAsJudge ? null : GAME.FIRST_SEAT,
            isJudge: hostAsJudge,
          },
        },
      },
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
  } catch (error) {
    // Partial unique index Lobby_hostId_active_unique срабатывает если
    // юзер успел проскочить findFirst-гейт двумя параллельными запросами.
    // Возвращаем тот же error code, что и upfront-проверка — клиент
    // видит единую UX-ошибку.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string | undefined)?.includes('hostId')
    ) {
      return fail(LOBBY_ERROR.HOST_HAS_ACTIVE_LOBBY);
    }
    throw error;
  }

  void broadcastLobbyUpdate(lobby.id);
  return ok(toLobbyDetails(lobby, hostId));
}
