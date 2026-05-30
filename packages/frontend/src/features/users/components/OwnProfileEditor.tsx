// Editable own-profile view at /user (no id, or id === viewer's publicCode).
//
// Editable mode: nickname + real name / country / club are saved in a single
// "Сохранить" click that fires both PATCH endpoints in parallel. Logout sits
// at the top right as a normal nav action. "Delete account" lives in an
// isolated danger zone way below, with a confirmation dialog that requires
// retyping the email.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { BAN_RESTRICTION } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { CountrySelect } from '@/components/ui/CountrySelect.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
import { Label } from '@/components/ui/Label.js';
import { cn } from '@/lib/cn.js';
import { ApiError } from '@/lib/api-client.js';
import {
  useAuthErrorMessage,
  useDeleteAccount,
  useLogout,
  useUpdateNickname,
  useUpdateProfile,
} from '@/features/auth/hooks/useAuth.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useSetPrimaryClub } from '@/features/clubs/hooks/useClubs.js';
import { ROUTE_PATH } from '@/routes/paths.js';

import {
  AvatarPickerDialog,
  deriveAvatarSelection,
  type AvatarSelection,
} from './AvatarPickerDialog.js';

export function OwnProfileEditor() {
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
