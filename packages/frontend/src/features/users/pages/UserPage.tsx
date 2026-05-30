// Unified user page at /user?id=<publicCode>.
//
// One route serves both modes:
//   - id matches the viewer's publicCode (or is absent) → editable own profile
//   - id is someone else's → read-only public profile
//
// Editable mode: nickname + real name / country / club are saved in a single
// "Сохранить" click that fires both PATCH endpoints in parallel. Logout sits
// at the top right as a normal nav action. "Delete account" lives in an
// isolated danger zone way below, with a confirmation dialog that requires
// retyping the email.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';

import {
  BAN_RESTRICTION,
  COMMON_AVATARS,
  REWARD_AVATARS,
  isStandardAvatar,
  requiredAchievementForAvatar,
  type PublicUserProfile,
  type StandardAvatarId,
} from '@mafia/shared';

import { AchievementBadge } from '@/components/ui/AchievementBadge.js';
import { getAchievement } from '@mafia/shared';
import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { CountryLabel } from '@/components/ui/CountryLabel.js';
import { CountrySelect } from '@/components/ui/CountrySelect.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
import { Label } from '@/components/ui/Label.js';
import { cn } from '@/lib/cn.js';
import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import {
  useAuthErrorMessage,
  useDeleteAccount,
  useLogout,
  useUpdateNickname,
  useUpdateProfile,
} from '@/features/auth/hooks/useAuth.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useSetPrimaryClub } from '@/features/clubs/hooks/useClubs.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';
import { useGoBack } from '@/lib/use-go-back.js';
import { ROUTE_PATH } from '@/routes/paths.js';

// Picker selection: a standard slot or no avatar.
// «Google photo» as a selection no longer exists — curated avatar set only.
// See ADR-equivalent rationale: avatars must be a meaningful curated reward,
// not whatever a user shoved into their Google profile.
type AvatarSelection = StandardAvatarId | null;

/** Modal-based avatar picker. Confirm/cancel preserve the previous selection
 *  until the user clicks Apply, so accidental taps don't mutate state. */
type AvatarTab = 'standard' | 'reward';

function AvatarPickerDialog({
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

/** Translate the current user state into the picker's selection model. */
function deriveAvatarSelection(avatarUrl: string | null | undefined): AvatarSelection {
  if (isStandardAvatar(avatarUrl)) return avatarUrl;
  // Anything else (including a stale Google photo URL on legacy accounts)
  // gets treated as "no selection". The data-cleanup migration nullifies
  // such avatarUrls, but render-side we're defensive.
  return null;
}

export function UserPage() {
  const [searchParams] = useSearchParams();
  const idParam = searchParams.get('id')?.trim() ?? '';
  const viewer = useAuthStore((state) => state.user);
  const isOwn = !idParam || (viewer && idParam.toUpperCase() === viewer.publicCode.toUpperCase());

  return isOwn ? <OwnProfileSection /> : <PublicProfileSection code={idParam} />;
}

function OwnProfileSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateNickname = useUpdateNickname();
  const updateProfile = useUpdateProfile();
  const setPrimaryClub = useSetPrimaryClub();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const authErrorMessage = useAuthErrorMessage();

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [realName, setRealName] = useState(user?.realName ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [primaryClubChoice, setPrimaryClubChoice] = useState<string | null>(
    user?.primaryClub?.clubId ?? null,
  );
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarSelection>(
    deriveAvatarSelection(user?.avatarUrl),
  );
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Clear the pending "saved" reset timer on unmount so it can't fire on an
  // unmounted component.
  useEffect(
    () => () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname);
    setRealName(user.realName ?? '');
    setCountry(user.country ?? '');
    setPrimaryClubChoice(user.primaryClub?.clubId ?? null);
    setSelectedAvatar(deriveAvatarSelection(user.avatarUrl));
  }, [user]);

  const currentAvatar = deriveAvatarSelection(user?.avatarUrl);

  // Достижения юзера = unlock-ключи для locked-аватарок. Берём из /me, не из
  // публичного профиля — это own profile, владелец должен видеть всё что
  // у него реально есть.
  const ownedAchievements = useMemo(
    () => new Set(user?.achievements?.map((a) => a.id) ?? []),
    [user?.achievements],
  );

  const dirty = useMemo(() => {
    if (!user) return false;
    const nickTrim = nickname.trim();
    const currentPrimaryId = user.primaryClub?.clubId ?? null;
    return (
      (nickTrim.length >= 2 && nickTrim !== user.nickname) ||
      realName.trim() !== (user.realName ?? '') ||
      country.trim() !== (user.country ?? '') ||
      primaryClubChoice !== currentPrimaryId ||
      selectedAvatar !== currentAvatar
    );
  }, [nickname, realName, country, primaryClubChoice, selectedAvatar, currentAvatar, user]);

  if (!user) return null;

  // EDIT_PROFILE бан выключает форму редактирования. Бэкенд отбросит
  // PATCH /users/me, но UX без FE-гейта сбивает — поле выглядит активным.
  const cannotEdit = user.banRestrictions.includes(BAN_RESTRICTION.EDIT_PROFILE);

  function extractErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return authErrorMessage(error.body.error);
    return authErrorMessage(undefined);
  }

  const saving = updateNickname.isPending || updateProfile.isPending || setPrimaryClub.isPending;
  const saveError = updateNickname.isError
    ? extractErrorMessage(updateNickname.error)
    : updateProfile.isError
      ? extractErrorMessage(updateProfile.error)
      : setPrimaryClub.isError
        ? extractErrorMessage(setPrimaryClub.error)
        : null;
  const deleteError = deleteAccount.isError ? extractErrorMessage(deleteAccount.error) : null;
  const emailMatches = confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase();
  const passwordOk = !user.hasPassword || confirmPassword.length > 0;
  const confirmMatches = emailMatches && passwordOk;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving) return;
    setSavedRecently(false);

    const tasks: Promise<unknown>[] = [];
    const nickTrim = nickname.trim();
    if (nickTrim !== user!.nickname) {
      tasks.push(updateNickname.mutateAsync({ nickname: nickTrim }));
    }
    const profileDirty =
      realName.trim() !== (user!.realName ?? '') ||
      country.trim() !== (user!.country ?? '') ||
      selectedAvatar !== currentAvatar;
    if (profileDirty) {
      tasks.push(
        updateProfile.mutateAsync({
          realName: realName.trim() === '' ? null : realName.trim(),
          country: country.trim() === '' ? null : country.trim(),
          avatarId: selectedAvatar,
        }),
      );
    }
    const currentPrimaryId = user!.primaryClub?.clubId ?? null;
    if (primaryClubChoice !== currentPrimaryId) {
      tasks.push(setPrimaryClub.mutateAsync(primaryClubChoice));
    }

    try {
      await Promise.all(tasks);
      setSavedRecently(true);
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSavedRecently(false), 2000);
    } catch {
      // Errors are surfaced via the mutation state above; no need to throw.
    }
  }

  function handleDeleteConfirm() {
    if (!confirmMatches) return;
    deleteAccount.mutate(
      {
        confirmEmail: confirmEmail.trim(),
        ...(user!.hasPassword ? { password: confirmPassword } : {}),
      },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          navigate(ROUTE_PATH.LOGIN);
        },
      },
    );
  }

  // Show the currently-staged selection in the header so the user sees a live
  // preview before clicking Save on the form.
  const headerAvatarUrl = selectedAvatar;

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(true)}
              aria-label={t('avatar.dialogTitle')}
              title={t('avatar.dialogTitle')}
              className={cn(
                'group relative shrink-0 overflow-hidden rounded-md border border-border bg-card-deep transition',
                'hover:border-accent',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              )}
            >
              <Avatar
                avatarUrl={headerAvatarUrl}
                nickname={user.nickname}
                size={64}
                shape="square"
              />
              {/* Always-visible edit pill in the corner: makes the clickable
                  affordance obvious even on the plain-initial fallback where
                  the tile would otherwise look static. */}
              <span
                aria-hidden="true"
                className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm"
              >
                <EditIcon />
              </span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-black/65 text-[10px] uppercase tracking-wider text-white opacity-0 transition group-hover:opacity-100"
              >
                {t('avatar.changeShort')}
              </span>
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-fg">{user.nickname}</h1>
              {user.realName && (
                <p className="mt-0.5 truncate text-sm text-muted">{user.realName}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            title={t('auth.profile.logout')}
            aria-label={t('auth.profile.logout')}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted transition hover:bg-card hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          >
            <LogoutIcon />
            <span className="hidden sm:inline">
              {logout.isPending ? t('auth.profile.loggingOut') : t('auth.profile.logout')}
            </span>
          </button>
        </header>

        <form
          onSubmit={handleSave}
          className="rounded-lg border border-border bg-card p-6 space-y-4"
          noValidate
        >
          <FormField
            label={t('auth.profile.emailLabel')}
            type="email"
            value={user.email}
            disabled
            onChange={() => undefined}
          />

          <div>
            <FormField
              label={t('auth.profile.nicknameLabel')}
              type="text"
              autoComplete="nickname"
              required
              minLength={2}
              maxLength={24}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              disabled={saving || cannotEdit}
            />
            <p className="mt-1 text-xs text-muted">{t('auth.profile.nicknameHint')}</p>
          </div>

          <div>
            <FormField
              label={t('profile.real_name')}
              type="text"
              maxLength={80}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              disabled={saving || cannotEdit}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.real_name_hint')}</p>
          </div>

          <div>
            <Label>{t('profile.country')}</Label>
            <CountrySelect
              value={country || null}
              onChange={(v) => setCountry(v ?? '')}
              disabled={saving || cannotEdit}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.country_hint')}</p>
          </div>

          {user.clubMemberships.length === 0 ? (
            <div className="rounded-md border border-border bg-bg/40 p-3 text-sm text-muted">
              {t('profile.primaryClub.noneCta')}{' '}
              <Link to={ROUTE_PATH.CLUBS} className="text-accent hover:underline">
                {t('profile.primaryClub.findCta')}
              </Link>
            </div>
          ) : (
            <div>
              <Label>{t('profile.primaryClub.label')}</Label>
              <select
                value={primaryClubChoice ?? ''}
                onChange={(e) =>
                  setPrimaryClubChoice(e.target.value === '' ? null : e.target.value)
                }
                disabled={saving || cannotEdit}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="">{t('profile.primaryClub.none')}</option>
                {user.clubMemberships.map((m) => (
                  <option key={m.clubId} value={m.clubId}>
                    {m.clubName}
                    {m.isHead ? ` · ${t('profile.primaryClub.headSuffix')}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{t('profile.primaryClub.hint')}</p>
            </div>
          )}

          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}

          {savedRecently && !saveError && (
            <p role="status" className="text-sm text-accent">
              {t('auth.profile.saved')}
            </p>
          )}

          <Button
            type="submit"
            size="md"
            className="w-full"
            disabled={saving || !dirty || cannotEdit}
            title={cannotEdit ? t('auth.profile.bannedEdit') : undefined}
          >
            {saving ? t('auth.profile.saving') : t('auth.profile.save')}
          </Button>
          {cannotEdit && (
            <p role="alert" className="text-xs text-warning text-center">
              {t('auth.profile.bannedEdit')}
            </p>
          )}
        </form>

        {/* Big visual gap before the danger zone — logout above is benign,
            account deletion below is permanent. */}
        <div className="pt-10">
          <div className="rounded-lg border border-danger/40 bg-card p-6 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-danger">
              {t('profile.danger_zone')}
            </h2>
            <p className="text-xs text-muted">{t('profile.delete_modal_body')}</p>
            <button
              type="button"
              onClick={() => {
                setConfirmEmail('');
                setConfirmPassword('');
                deleteAccount.reset();
                setDeleteOpen(true);
              }}
              className="text-sm font-medium text-danger hover:underline"
            >
              {t('profile.delete_account')}
            </button>
          </div>
        </div>
      </div>

      <AvatarPickerDialog
        open={avatarPickerOpen}
        initial={selectedAvatar}
        nickname={user.nickname}
        ownedAchievements={ownedAchievements}
        onClose={() => setAvatarPickerOpen(false)}
        onApply={setSelectedAvatar}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleteAccount.isPending) setDeleteOpen(false);
        }}
        title={t('profile.delete_modal_title')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteAccount.isPending}
            >
              {t('profile.delete_modal_cancel')}
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={!confirmMatches || deleteAccount.isPending}
              className="bg-danger hover:bg-danger/90"
            >
              {t('profile.delete_modal_confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('profile.delete_modal_body')}</p>
        <p className="text-xs text-muted">
          {t('profile.delete_modal_email_hint')}{' '}
          <span className="font-mono text-fg">{user.email}</span>
        </p>
        <FormField
          label={t('profile.delete_modal_email_label')}
          type="email"
          autoComplete="off"
          value={confirmEmail}
          onChange={(event) => setConfirmEmail(event.target.value)}
          disabled={deleteAccount.isPending}
        />
        {user.hasPassword && (
          <FormField
            label={t('profile.delete_modal_password_label')}
            type="password"
            autoComplete="current-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={deleteAccount.isPending}
          />
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        )}
      </Dialog>
    </div>
  );
}

function PublicProfileSection({ code }: { code: string }) {
  const { t } = useTranslation();
  // Кнопка «Назад» использует историю браузера — открыли профиль из
  // /players → вернёмся в /players. На прямом заходе по share-ссылке
  // fallback на /players (директорию игроков — самое осмысленное место).
  const goBack = useGoBack(ROUTE_PATH.PLAYERS);

  const query = useQuery({
    queryKey: ['public-user', code],
    queryFn: () => authApi.getPublicUser(code),
    enabled: Boolean(code),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  if (query.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="mx-auto max-w-md text-sm text-muted">{t('common.loading')}</p>
      </div>
    );
  }

  const notFound = query.isError && query.error instanceof ApiError && query.error.status === 404;
  if (notFound || (!query.data && !query.isLoading)) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 text-center space-y-4">
          <p className="text-base text-fg">{t('public_profile.not_found')}</p>
          <Button variant="secondary" onClick={goBack}>
            {t('public_profile.not_found_back')}
          </Button>
        </div>
      </div>
    );
  }

  const profile = query.data?.user;
  if (!profile) return null;
  const joinedRel = formatRelativeTime(profile.createdAt);

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-4">
            <Avatar avatarUrl={profile.avatarUrl} nickname={profile.nickname} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold text-fg">{profile.nickname}</h1>
              <p className="mt-1 inline-flex items-center rounded-md bg-card-deep px-2 py-0.5 font-mono text-xs text-muted">
                {profile.publicCode}
              </p>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            {profile.realName && (
              <Row label={t('public_profile.real_name')} value={profile.realName} />
            )}
            {profile.country && (
              <Row
                label={t('public_profile.country')}
                value={<CountryLabel code={profile.country} />}
              />
            )}
            {profile.primaryClubName && (
              <Row label={t('public_profile.club')} value={profile.primaryClubName} />
            )}
          </dl>

          <PublicProfileStats profile={profile} />

          {profile.achievements.length > 0 && (
            <section className="mt-4 space-y-2">
              <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">
                {t('public_profile.achievementsTitle')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.achievements.map((a) => (
                  <AchievementBadge key={a.id} id={a.id} size="card" />
                ))}
              </div>
            </section>
          )}

          {joinedRel && (
            <p className="text-xs text-muted">
              {t('public_profile.joined')}: {joinedRel}
            </p>
          )}

          <p className="pt-1 text-sm">
            <button
              type="button"
              onClick={goBack}
              className="text-muted hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              ← {t('common.back')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}

// Блок «Статистика» в публичном профиле: тотал игр / побед / поражений /
// win-rate + разбивка побед по роли + отдельная строчка про судейство.
// Прячется целиком, если игрок ещё ни одной партии не отыграл.
function PublicProfileStats({ profile }: { profile: PublicUserProfile }) {
  const { t } = useTranslation();
  if (profile.gamesPlayed === 0 && profile.gamesAsJudge === 0) {
    return <p className="text-xs text-muted">{t('public_profile.statsEmpty')}</p>;
  }
  const winRate =
    profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : null;
  const hasRoleWins =
    profile.winsByRole.civilian > 0 ||
    profile.winsByRole.sheriff > 0 ||
    profile.winsByRole.mafia > 0 ||
    profile.winsByRole.don > 0;
  return (
    <section className="mt-4 rounded-md border border-border bg-card-deep p-3 space-y-2">
      <h2 className="text-xs uppercase tracking-wider text-muted font-semibold">
        {t('public_profile.statsTitle')}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <Stat label={t('public_profile.statGames')} value={profile.gamesPlayed} />
        <Stat label={t('public_profile.statWins')} value={profile.wins} />
        <Stat label={t('public_profile.statLosses')} value={profile.losses} />
        <Stat
          label={t('public_profile.statWinRate')}
          value={winRate !== null ? `${winRate}%` : '—'}
        />
      </div>
      {hasRoleWins && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
          <Stat label={t('game.role.civilian')} value={profile.winsByRole.civilian} small />
          <Stat label={t('game.role.sheriff')} value={profile.winsByRole.sheriff} small />
          <Stat label={t('game.role.mafia')} value={profile.winsByRole.mafia} small />
          <Stat label={t('game.role.don')} value={profile.winsByRole.don} small />
        </div>
      )}
      {profile.gamesAsJudge > 0 && (
        <p className="text-xs text-muted text-center">
          {t('public_profile.statJudge', { count: profile.gamesAsJudge })}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, small }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div>
      <p
        className={cn('font-semibold', small ? 'text-sm text-fg' : 'text-xl text-fg leading-none')}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

function EditIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
