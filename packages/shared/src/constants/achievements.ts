// Каталог достижений. Каждое достижение — статическая запись с id,
// заголовком, описанием, иконкой и редкостью. Когда игрок получает
// ачивмент, мы записываем только { id, earnedAt } в User.achievements
// (Json-массив) — всё описание подтягивается отсюда на клиенте.
//
// Чтобы добавить новое достижение:
//   1. Добавь запись в ACHIEVEMENTS ниже с уникальным `id`.
//   2. В backend/src/modules/game/game.achievements.ts добавь функцию-проверку
//      условия и вызови её из applyAchievementsForFinishedGame.
//   3. (Опционально) переведи name/description через i18n-ключи — здесь
//      сидят только дефолтные RU/EN строки на случай отсутствия перевода.

export type AchievementId = 'alpha_tester';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: AchievementId;
  /** Эмодзи или короткий glyph для отрисовки бейджика рядом с ником. */
  icon: string;
  rarity: AchievementRarity;
  ru: { name: string; description: string };
  en: { name: string; description: string };
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'alpha_tester',
    icon: '🎭',
    rarity: 'legendary',
    ru: {
      name: 'Участник альфа-теста',
      description:
        'Выдаётся за партию до конца в составе минимум 5 живых игроков. Спасибо за участие в альфе!',
    },
    en: {
      name: 'Alpha tester',
      description:
        'Awarded for finishing a match with at least 5 real players at the table. Thank you for being part of the alpha!',
    },
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: string): Achievement | null {
  return BY_ID.get(id as AchievementId) ?? null;
}

/** Granted-rows как они хранятся в User.achievements JSON. */
export interface EarnedAchievement {
  id: AchievementId;
  earnedAt: string; // ISO datetime
}
