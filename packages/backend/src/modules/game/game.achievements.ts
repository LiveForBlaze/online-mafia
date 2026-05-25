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
 * Применить все ачивменты для участников завершённой игры.
 *
 * @param userIds non-bot участники + судья — для них проверяем правила.
 * @param humanPlayerCount Сколько за столом сидело реальных людей (не считая
 *   судью и ботов). Передаётся caller'ом из finalizeGameStats, чтобы
 *   game-wide условия (например «партия не была тестом с ботами»)
 *   проверялись по фактическому составу стола.
 *
 * @returns Map `userId → list of NEWLY earned achievements` для этой партии.
 *   Caller использует его чтобы бродкастнуть unlock-модалку пострадавшим
 *   юзерам. Пустая запись (или отсутствие ключа) = у этого юзера в эту
 *   партию ничего нового не открылось.
 */
export async function applyAchievementsForFinishedGame(
  userIds: string[],
  humanPlayerCount: number,
  tx: Prisma.TransactionClient = prisma,
): Promise<Map<string, EarnedAchievement[]>> {
  const newlyByUser = new Map<string, EarnedAchievement[]>();
  if (userIds.length === 0) return newlyByUser;

  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      isBot: true,
      achievements: true,
    },
  });

  for (const user of users) {
    if (user.isBot) continue;

    const earned = parseEarnedList(user.achievements);
    const newlyEarned: EarnedAchievement[] = [];

    // alpha_tester: дошёл до конца партии, где сидело ≥5 живых игроков
    // (без судьи и ботов). Защищает ачивку от соло-тестов «1 человек +
    // 9 ботов» — её должны получать те, кто помог реально оттестировать
    // игру с настоящими людьми.
    if (!hasAchievement(earned, 'alpha_tester') && humanPlayerCount >= 5) {
      newlyEarned.push({ id: 'alpha_tester', earnedAt: new Date().toISOString() });
    }

    if (newlyEarned.length === 0) continue;

    const updated: EarnedAchievement[] = [...earned, ...newlyEarned];
    await tx.user.update({
      where: { id: user.id },
      data: { achievements: updated as unknown as Prisma.InputJsonValue },
    });
    logger.info({ userId: user.id, ids: newlyEarned.map((a) => a.id) }, 'achievement granted');
    newlyByUser.set(user.id, newlyEarned);
  }
  return newlyByUser;
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
