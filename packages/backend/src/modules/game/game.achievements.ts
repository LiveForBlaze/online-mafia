// Выдача достижений по итогам завершённой игры.
//
// Вызывается из finalizeGameStats после того, как игровые счётчики
// (gamesPlayed/wins/losses) уже инкрементированы — так условия могут
// проверять актуальные значения. Сама выдача идемпотентна по id:
// если у юзера запись `alpha_tester` уже есть, повторно не добавляем.

import { type Prisma } from '@prisma/client';
import { type AchievementId, type EarnedAchievement } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../lib/logger.js';

/**
 * Применить все ачивменты для участников завершённой игры. Аргументы —
 * массив userId'ов, для которых нужно прогнать проверки (обычно это
 * non-bot участники + судья).
 */
export async function applyAchievementsForFinishedGame(
  userIds: string[],
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  if (userIds.length === 0) return;

  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      isBot: true,
      gamesPlayed: true,
      gamesAsJudge: true,
      achievements: true,
    },
  });

  for (const user of users) {
    if (user.isBot) continue;

    const earned = parseEarnedList(user.achievements);
    const newlyEarned: EarnedAchievement[] = [];

    // alpha_tester: сыграл / отсудил хотя бы одну партию.
    if (!hasAchievement(earned, 'alpha_tester')) {
      if (user.gamesPlayed >= 1 || user.gamesAsJudge >= 1) {
        newlyEarned.push({ id: 'alpha_tester', earnedAt: new Date().toISOString() });
      }
    }

    if (newlyEarned.length === 0) continue;

    const updated: EarnedAchievement[] = [...earned, ...newlyEarned];
    await tx.user.update({
      where: { id: user.id },
      data: { achievements: updated as unknown as Prisma.InputJsonValue },
    });
    logger.info({ userId: user.id, ids: newlyEarned.map((a) => a.id) }, 'achievement granted');
  }
}

function parseEarnedList(raw: Prisma.JsonValue | null | undefined): EarnedAchievement[] {
  if (!Array.isArray(raw)) return [];
  const out: EarnedAchievement[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as Record<string, unknown>).id;
    const earnedAt = (item as Record<string, unknown>).earnedAt;
    if (typeof id !== 'string' || typeof earnedAt !== 'string') continue;
    out.push({ id: id as AchievementId, earnedAt });
  }
  return out;
}

function hasAchievement(earned: EarnedAchievement[], id: AchievementId): boolean {
  return earned.some((e) => e.id === id);
}
