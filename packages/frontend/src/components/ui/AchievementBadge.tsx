// Бейджик достижения. Маленький эмодзи + tooltip с названием/описанием.
// Используется и в карточке профиля, и рядом с ником в leaderboard'е.

import { useTranslation } from 'react-i18next';

import { getAchievement } from '@mafia/shared';

import { cn } from '@/lib/cn.js';

interface AchievementBadgeProps {
  id: string;
  /** Подробная карточка (профиль) или маленькая иконка (таблица). */
  size?: 'inline' | 'card';
}

export function AchievementBadge({ id, size = 'inline' }: AchievementBadgeProps) {
  const { i18n } = useTranslation();
  const a = getAchievement(id);
  if (!a) return null;
  const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';

  if (size === 'card') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/5 p-3">
        <span className="text-2xl leading-none">{a.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{a[locale].name}</p>
          <p className="text-xs text-muted">{a[locale].description}</p>
        </div>
      </div>
    );
  }

  return (
    <span
      // Tooltip — только название. Полное описание (как ачивка достаётся)
      // живёт в библиотеке аватарок (секция «Наградные») и на странице
      // профиля как карточка. Длинная подсказка на маленьком emoji-бейдже
      // у никнейма в лидерборде неуместна — мешает читать строку.
      title={a[locale].name}
      aria-label={a[locale].name}
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 text-sm leading-none cursor-help',
      )}
    >
      {a.icon}
    </span>
  );
}
