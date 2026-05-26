// Промо-блок альфа-аватаров между списком лобби и секцией «Три шага».
// Показывает обе reward-аватарки (мужскую/женскую), копирайт про критерий
// получения. CTA только для уже получившей ачивку версии — ведёт в
// библиотеку аватарок (профиль), чтобы можно было сразу надеть.
//
// Для locked-варианта кнопку не показываем: текст рядом уже описывает,
// как получить аватар; дублирующая кнопка-к-полному-объяснению
// перегружала блок и сбивала с толку («как получить → профиль?»).

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Heart, Lock } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { userProfilePath } from '@/routes/paths.js';

const ALPHA_ID = 'alpha_tester';

export function RewardAvatarPromo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const owned = (user?.achievements ?? []).some((a) => a.id === ALPHA_ID);

  function handleOwnedCta() {
    if (user) navigate(userProfilePath(user.publicCode));
  }

  return (
    <section className="relative overflow-hidden rounded-xl border border-warning/30 bg-gradient-to-br from-warning/[0.08] to-transparent p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 gap-3">
          <RewardSlot id="avatar-alpha-m" locked={!owned} />
          <RewardSlot id="avatar-alpha-f" locked={!owned} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight text-fg">
            {owned ? t('rewardPromo.titleOwned') : t('rewardPromo.titleLocked')}
          </h2>
          <p className="text-sm text-muted max-w-2xl">
            {owned ? t('rewardPromo.bodyOwned') : t('rewardPromo.bodyLocked')}
          </p>
        </div>

        {owned && (
          <div className="shrink-0">
            <Button variant="secondary" onClick={handleOwnedCta}>
              <Heart size={14} strokeWidth={2} className="mr-1.5" aria-hidden="true" />
              {t('rewardPromo.ctaOwned')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function RewardSlot({ id, locked }: { id: string; locked: boolean }) {
  return (
    <div className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-md">
      <Avatar avatarUrl={id} nickname={id} size={null} shape="square" />
      {locked && (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/60"
        >
          <Lock size={18} strokeWidth={1.75} className="text-muted" />
        </span>
      )}
    </div>
  );
}
