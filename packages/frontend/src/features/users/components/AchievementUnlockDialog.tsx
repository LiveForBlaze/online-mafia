// Модалка «вы открыли достижение». Появляется в конце партии (за неё
// отвечает SERVER_EVENT.ACHIEVEMENTS_UNLOCKED → useGameConnection). Берёт
// первую ачивку из очереди useAchievementUnlockStore, показывает её
// иконку, имя, описание и список аватарок, которые она разблокировала.
//
// Закрывается по «Спасибо» — это `dismissCurrent()` сдвигает очередь.
// Если за партию открылось несколько ачивок, модалка автоматически
// покажет следующую после закрытия текущей.

import { useTranslation } from 'react-i18next';

import { AVATARS_BY_ACHIEVEMENT, getAchievement } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { useAchievementUnlockStore } from '@/features/users/store/achievement-unlocks.store.js';

export function AchievementUnlockDialog() {
  const { t, i18n } = useTranslation();
  const current = useAchievementUnlockStore((s) => s.queue[0]);
  const dismiss = useAchievementUnlockStore((s) => s.dismissCurrent);

  if (!current) return null;

  const meta = getAchievement(current.id);
  // Не показываем модалку для неизвестных id — может прилететь после
  // деплоя с новой ачивкой на старый клиент. Тихо дропаем из очереди.
  if (!meta) {
    dismiss();
    return null;
  }

  const locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  // Какие аватарки эта ачивка разблокировала. Может быть пусто (ачивка
  // без визуальной награды — пока такой нет, но архитектурно допустимо).
  const unlockedAvatars =
    (AVATARS_BY_ACHIEVEMENT as Record<string, readonly string[]>)[current.id] ?? [];

  return (
    <Dialog
      open
      onClose={dismiss}
      title={t('achievementUnlock.title')}
      footer={
        <Button onClick={dismiss} className="w-full">
          {t('achievementUnlock.confirm')}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <span className="text-6xl leading-none" aria-hidden="true">
          {meta.icon}
        </span>
        <h3 className="text-lg font-semibold text-fg">{meta[locale].name}</h3>
        <p className="text-center text-sm text-muted">{meta[locale].description}</p>
      </div>

      {unlockedAvatars.length > 0 && (
        <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-warning">
            {t('achievementUnlock.unlockedAvatars')}
          </p>
          <div className="flex justify-center gap-3">
            {unlockedAvatars.map((id) => (
              <div key={id} className="h-20 w-20 overflow-hidden rounded-md">
                <Avatar avatarUrl={id} nickname={id} size={null} shape="square" />
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            {t('achievementUnlock.libraryHint')}
          </p>
        </div>
      )}
    </Dialog>
  );
}
