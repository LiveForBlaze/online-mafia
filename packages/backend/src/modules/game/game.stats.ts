// Финализация статистики по завершённой игре.
//
// Принципы:
//   1. Идемпотентность. Game.statsApplied — флажок, обновляемый ОДНОВРЕМЕННО
//      с инкрементом счётчиков User в той же транзакции. Если работа
//      падает на полпути, либо вся транзакция откатывается, либо
//      применяется целиком — посчитать дважды невозможно.
//   2. Боты и судья не учитываются как игроки. Судья получает свой
//      отдельный счётчик `gamesAsJudge`.
//   3. Removed-игроки (isRemoved=true) тоже учитываются: техническое
//      поражение по ФИИМ — это поражение, не «не играл». Считаем им
//      gamesPlayed +1 и losses +1.

import { Prisma } from '@prisma/client';
import { ROLE_TO_TEAM, type Role, type Team } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { logger } from '../../lib/logger.js';

/**
 * Однократно применить пользовательскую статистику для завершённой игры.
 * Безопасно вызывать многократно — повторные вызовы no-op.
 */
export async function finalizeGameStats(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      statsApplied: true,
      winnerTeam: true,
      endedAt: true,
      participants: {
        select: {
          userId: true,
          isJudge: true,
          role: true,
          user: { select: { id: true, isBot: true } },
        },
      },
    },
  });
  if (!game || game.statsApplied || !game.endedAt) return;

  const winner = (game.winnerTeam ?? null) as Team | null;

  await prisma.$transaction(async (tx) => {
    // CAS-guard: проверяем `statsApplied=false` в самом UPDATE. Если
    // вторая параллельная фиксация уже выставила true, мы получим
    // count=0 и выходим без изменений.
    const flagged = await tx.game.updateMany({
      where: { id: gameId, statsApplied: false },
      data: { statsApplied: true },
    });
    if (flagged.count === 0) return;

    for (const p of game.participants) {
      if (p.user.isBot) continue;

      if (p.isJudge) {
        await tx.user.update({
          where: { id: p.userId },
          data: { gamesAsJudge: { increment: 1 } },
        });
        continue;
      }

      const role = (p.role as Role | null) ?? null;
      const team = role ? ROLE_TO_TEAM[role] : null;
      const won = winner !== null && team === winner;

      const data: Prisma.UserUpdateInput = {
        gamesPlayed: { increment: 1 },
      };
      if (won) {
        data.wins = { increment: 1 };
        if (role) {
          // Прибавляем в существующий объект, не теряя другие роли.
          // raw SQL для merge — Prisma JSON-инкремент не поддерживает.
          await tx.$executeRaw`
            UPDATE "User"
            SET "winsByRole" = jsonb_set(
              COALESCE("winsByRole", '{}'::jsonb),
              ${`{${role}}`}::text[],
              (COALESCE("winsByRole"->>${role}, '0')::int + 1)::text::jsonb
            )
            WHERE id = ${p.userId}
          `;
        }
      } else {
        data.losses = { increment: 1 };
      }

      await tx.user.update({ where: { id: p.userId }, data });
    }
  });

  logger.info({ gameId, winner }, 'game stats finalised');
}
