// Avatar picker dialog used by the own-profile editor, plus the shared
// AvatarSelection model and the deriveAvatarSelection helper that maps the
// current user state into that model.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';

import {
  COMMON_AVATARS,
  REWARD_AVATARS,
  getAchievement,
  isStandardAvatar,
  requiredAchievementForAvatar,
  type StandardAvatarId,
} from '@mafia/shared';

import { AchievementBadge } from '@/components/ui/AchievementBadge.js';
import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { cn } from '@/lib/cn.js';

// Picker selection: a standard slot or no avatar.
// «Google photo» as a selection no longer exists — curated avatar set only.
// See ADR-equivalent rationale: avatars must be a meaningful curated reward,
// not whatever a user shoved into their Google profile.
export type AvatarSelection = StandardAvatarId | null;

/** Translate the current user state into the picker's selection model. */
export function deriveAvatarSelection(avatarUrl: string | null | undefined): AvatarSelection {
  if (isStandardAvatar(avatarUrl)) return avatarUrl;
  // Anything else (including a stale Google photo URL on legacy accounts)
  // gets treated as "no selection". The data-cleanup migration nullifies
  // such avatarUrls, but render-side we're defensive.
  return null;
}

/** Modal-based avatar picker. Confirm/cancel preserve the previous selection
 *  until the user clicks Apply, so accidental taps don't mutate state. */
type AvatarTab = 'standard' | 'reward';

export function AvatarPickerDialog({
  open,
  initial,
  nickname,
  ownedAchievements,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: AvatarSelection;
  nickname: string;
  ownedAchievements: ReadonlySet<string>;
  onClose: () => void;
  onApply: (id: AvatarSelection) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<AvatarSelection>(initial);
  // Дефолтная вкладка зависит от текущего выбора: если у юзера сейчас
  // награда — открываем пикер на «Наградных», чтобы её сразу было видно.
  const initialTab: AvatarTab =
    initial !== null && (REWARD_AVATARS as readonly string[]).includes(initial)
      ? 'reward'
      : 'standard';
  const [tab, setTab] = useState<AvatarTab>(initialTab);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setTab(initialTab);
    }
    // Намеренно зависим только от `open` — initial/initialTab меняются как
    // результат `initial`, но переключать вкладку нужно только в момент
    // открытия диалога, не на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleApply() {
    onApply(draft);
    onClose();
  }

  // Что показывать в preview-окне по текущему draft'у.
  const previewAvatarUrl = draft;
  const previewCaption = draft === null ? t('avatar.none') : t('avatar.selected');

  // Если выбран reward-аватар — показываем карточку с описанием ачивки,
  // которая его разблокирует. Помогает понять «зачем эта картинка
  // заблокирована» и «как её получить».
  const draftRewardAchievementId = draft !== null ? requiredAchievementForAvatar(draft) : null;
  const draftRewardAchievement = draftRewardAchievementId
    ? getAchievement(draftRewardAchievementId)
    : null;

  // Сколько ачивок-аватарок реально доступно — показываем точку на вкладке,
  // если у юзера есть хоть одна разблокированная награда.
  const hasUnlockedReward = REWARD_AVATARS.some((id) => {
    const need = requiredAchievementForAvatar(id);
    return need !== null && ownedAchievements.has(need);
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('avatar.dialogTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply}>{t('common.apply')}</Button>
        </>
      }
    >
      {/* Preview — большой превью текущего draft. Показывает что именно
          сохранится при нажатии «Применить» до того, как пользователь это
          сделает. */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div
          aria-label={t('avatar.previewLabel')}
          className="h-32 w-32 overflow-hidden rounded-lg ring-2 ring-accent/40 ring-offset-2 ring-offset-card"
        >
          <Avatar avatarUrl={previewAvatarUrl} nickname={nickname} size={null} shape="square" />
        </div>
        <span className="text-xs text-muted">{previewCaption}</span>
      </div>

      {/* Инфо-блок про ачивку, разблокирующую выбранный reward-аватар.
          Видно только когда в превью — награда; для обычных аватарок
          ничего лишнего не показываем. */}
      {draftRewardAchievement && (
        <div className="my-2">
          <AchievementBadge id={draftRewardAchievement.id} size="card" />
        </div>
      )}

      {/* Tabs — категории. «Стандартные» (включая Google и «без аватара»)
          и «Наградные» (за достижения). */}
      <div
        role="tablist"
        aria-label={t('avatar.dialogTitle')}
        className="mb-3 flex gap-1 border-b border-border"
      >
        <PickerTabButton
          active={tab === 'standard'}
          onClick={() => setTab('standard')}
          label={t('avatar.tabs.standard')}
        />
        <PickerTabButton
          active={tab === 'reward'}
          onClick={() => setTab('reward')}
          label={t('avatar.tabs.rewards')}
          dot={hasUnlockedReward}
        />
      </div>

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        {tab === 'standard' && (
          <>
            {COMMON_AVATARS.map((id) => (
              <AvatarTile
                key={id}
                id={id}
                selected={draft === id}
                locked={false}
                onPick={() => setDraft(id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label={t('avatar.none')}
              aria-pressed={draft === null}
              className={cn(
                'flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-muted text-sm text-muted transition-all',
                'hover:border-fg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                draft === null &&
                  'border-accent text-accent ring-2 ring-accent ring-offset-2 ring-offset-card',
              )}
            >
              ✕
            </button>
          </>
        )}

        {tab === 'reward' &&
          REWARD_AVATARS.map((id) => {
            const requiredAch = requiredAchievementForAvatar(id);
            const locked = requiredAch !== null && !ownedAchievements.has(requiredAch);
            return (
              <AvatarTile
                key={id}
                id={id}
                selected={draft === id}
                locked={locked}
                lockedTitle={locked ? t('avatar.lockedHint') : undefined}
                onPick={() => {
                  if (!locked) setDraft(id);
                }}
              />
            );
          })}
        {tab === 'reward' && REWARD_AVATARS.length === 0 && (
          <p className="col-span-full text-center text-sm text-muted py-6">
            {t('avatar.noRewards')}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function PickerTabButton({
  active,
  onClick,
  label,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative -mb-px px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md',
        active
          ? 'border-b-2 border-accent text-fg'
          : 'border-b-2 border-transparent text-muted hover:text-fg',
      )}
    >
      {label}
      {dot && (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
        />
      )}
    </button>
  );
}

function AvatarTile({
  id,
  selected,
  locked,
  lockedTitle,
  onPick,
}: {
  id: StandardAvatarId;
  selected: boolean;
  locked: boolean;
  lockedTitle?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={id}
      aria-pressed={selected}
      aria-disabled={locked}
      disabled={locked}
      title={lockedTitle}
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-md transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        locked
          ? 'cursor-not-allowed opacity-40 grayscale'
          : selected
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-card'
            : 'opacity-80 hover:opacity-100',
      )}
    >
      <Avatar avatarUrl={id} nickname={id} size={null} shape="square" />
      {locked && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40"
        >
          <Lock size={20} strokeWidth={1.75} className="text-muted" />
        </span>
      )}
    </button>
  );
}
