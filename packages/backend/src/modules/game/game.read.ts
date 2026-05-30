// Game read/projection — per-user state projection and the host-only event log.

import { type GameStateProjected } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { projectFor } from './game.engine.js';
import { GAME_ERROR } from './game.errors.js';
import { getGame } from './game.registry.js';
import { findByUserId } from './game.state.js';
import { GAME_EVENT_TYPE, ok, fail, type ServiceResult } from './game.service.internal.js';

export async function getProjectedStateFor(
  gameId: string,
  userId: string,
): Promise<ServiceResult<GameStateProjected>> {
  const state = getGame(gameId);
  if (!state) return fail(GAME_ERROR.GAME_NOT_FOUND);

  const participant = findByUserId(state, userId);
  if (!participant) return fail(GAME_ERROR.NOT_PARTICIPANT);

  return ok(projectFor(state, userId));
}

export function isParticipant(gameId: string, userId: string): boolean {
  const state = getGame(gameId);
  if (!state) return false;
  return Boolean(findByUserId(state, userId));
}

// Host-only game log: formatted event lines suitable for a debrief modal.
// Returns null lines for events that are not interesting to a human reader so
// the formatter on the caller side can just .filter(Boolean) them out.
export async function getGameLogForHost(
  gameId: string,
  viewerUserId: string,
): Promise<ServiceResult<{ lines: string[] }>> {
  // In-memory state может отсутствовать: партия закончилась и была
  // выгружена, или сервер пересобрался посреди дебрифа (пользователь
  // жаловался: «Failed to load log» сразу после деплоя). DB всегда хранит
  // и GameParticipant, и GameEvent — собираем лог из них, in-memory state
  // используем только как ускорение.
  const state = getGame(gameId);

  const seatByUser = new Map<string, number | null>();
  const roleByUser = new Map<string, string | null>();
  let viewerIsJudge = false;

  if (state) {
    for (const p of state.participants) {
      seatByUser.set(p.userId, p.seat);
      roleByUser.set(p.userId, p.role);
    }
    const viewer = findByUserId(state, viewerUserId);
    viewerIsJudge = Boolean(viewer?.isJudge);
  } else {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: { select: { userId: true, seat: true, role: true, isJudge: true } },
      },
    });
    if (!game) return fail(GAME_ERROR.GAME_NOT_FOUND);
    for (const p of game.participants) {
      seatByUser.set(p.userId, p.seat);
      roleByUser.set(p.userId, p.role);
      if (p.userId === viewerUserId && p.isJudge) viewerIsJudge = true;
    }
  }

  if (!viewerIsJudge) return fail(GAME_ERROR.NOT_JUDGE);

  const events = await prisma.gameEvent.findMany({
    where: { gameId },
    orderBy: { seq: 'asc' },
  });

  const lines: string[] = [];
  for (const ev of events) {
    const line = formatLogLine(ev, seatByUser, roleByUser);
    if (line) lines.push(line);
  }
  return ok({ lines });
}

function formatLogLine(
  event: { type: string; phase: string; actorId: string | null; payload: unknown },
  seatBy: Map<string, number | null>,
  roleBy: Map<string, string | null>,
): string | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const actorSeat = event.actorId ? (seatBy.get(event.actorId) ?? null) : null;
  const actorRole = event.actorId ? (roleBy.get(event.actorId) ?? null) : null;
  const roleRu = (r: string | null) =>
    r === 'mafia'
      ? 'мафия'
      : r === 'don'
        ? 'дон'
        : r === 'sheriff'
          ? 'шериф'
          : r === 'civilian'
            ? 'мирный'
            : '';

  switch (event.type) {
    case GAME_EVENT_TYPE.PHASE_CHANGED: {
      const to = String(payload.to ?? '');
      const day = Number(payload.dayNumber ?? 0);
      if (to.startsWith('day_speech') || to === 'day_speech') return `── День ${day} ──`;
      if (to === 'night_mafia') return `── Ночь ${day} ──`;
      if (to === 'game_over') return `── Игра окончена ──`;
      return null;
    }
    case GAME_EVENT_TYPE.MAFIA_TARGETED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `${roleRu(actorRole)} (${actorSeat}) — стреляет в ${target}`;
    }
    case GAME_EVENT_TYPE.DON_CHECKED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `дон (${actorSeat}) — проверяет ${target}`;
    }
    case GAME_EVENT_TYPE.SHERIFF_CHECKED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `шериф (${actorSeat}) — проверяет ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_NOMINATED: {
      const target = payload.targetSeat;
      if (actorSeat == null || target == null) return null;
      return `игрок ${actorSeat} — выставляет ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_VOTED: {
      const target = payload.candidateSeat;
      if (actorSeat == null || target == null) return null;
      return `игрок ${actorSeat} — голос за ${target}`;
    }
    case GAME_EVENT_TYPE.PLAYER_KILLED_BY_VOTE: {
      const seat = payload.seat;
      if (seat == null) return null;
      return `Голосованием выбит игрок ${seat}`;
    }
    case GAME_EVENT_TYPE.PLAYER_KILLED_AT_NIGHT: {
      const seat = payload.seat ?? payload.victimSeat;
      if (seat == null) return 'Ночью никто не погиб';
      return `Ночью убит игрок ${seat}`;
    }
    case GAME_EVENT_TYPE.FOUL_ISSUED: {
      const targetUserId = String(payload.targetUserId ?? '');
      const seat = seatBy.get(targetUserId);
      if (seat == null) return null;
      const self = payload.selfFoul ? ' (под фол)' : '';
      return `Фол игроку ${seat}${self}`;
    }
    case GAME_EVENT_TYPE.PLAYER_REMOVED: {
      const targetUserId = String(payload.targetUserId ?? '');
      const seat = seatBy.get(targetUserId);
      if (seat == null) return null;
      const self = payload.selfRemoved ? ' (сам)' : '';
      return `Удалён игрок ${seat}${self}`;
    }
    case GAME_EVENT_TYPE.GAME_ENDED: {
      const winner = payload.winner;
      return winner ? `Победили: ${winner}` : 'Игра завершена';
    }
    default:
      return null;
  }
}
