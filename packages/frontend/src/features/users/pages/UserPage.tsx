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

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
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
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';
import { ROUTE_PATH } from '@/routes/paths.js';

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
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const authErrorMessage = useAuthErrorMessage();

  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [realName, setRealName] = useState(user?.realName ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [clubName, setClubName] = useState(user?.clubName ?? '');
  const [savedRecently, setSavedRecently] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname);
    setRealName(user.realName ?? '');
    setCountry(user.country ?? '');
    setClubName(user.clubName ?? '');
  }, [user]);

  const dirty = useMemo(() => {
    if (!user) return false;
    const nickTrim = nickname.trim();
    return (
      (nickTrim.length >= 2 && nickTrim !== user.nickname) ||
      realName.trim() !== (user.realName ?? '') ||
      country.trim() !== (user.country ?? '') ||
      clubName.trim() !== (user.clubName ?? '')
    );
  }, [nickname, realName, country, clubName, user]);

  if (!user) return null;

  function extractErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return authErrorMessage(error.body.error);
    return authErrorMessage(undefined);
  }

  const saving = updateNickname.isPending || updateProfile.isPending;
  const saveError = updateNickname.isError
    ? extractErrorMessage(updateNickname.error)
    : updateProfile.isError
      ? extractErrorMessage(updateProfile.error)
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
      clubName.trim() !== (user!.clubName ?? '');
    if (profileDirty) {
      tasks.push(
        updateProfile.mutateAsync({
          realName: realName.trim() === '' ? null : realName.trim(),
          country: country.trim() === '' ? null : country.trim(),
          clubName: clubName.trim() === '' ? null : clubName.trim(),
        }),
      );
    }

    try {
      await Promise.all(tasks);
      setSavedRecently(true);
      window.setTimeout(() => setSavedRecently(false), 2000);
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

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-fg">{t('auth.profile.title')}</h1>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="text-sm text-muted hover:text-fg hover:underline disabled:opacity-60"
          >
            {logout.isPending ? t('auth.profile.loggingOut') : t('auth.profile.logout')}
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
              disabled={saving}
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
              disabled={saving}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.real_name_hint')}</p>
          </div>

          <div>
            <FormField
              label={t('profile.country')}
              type="text"
              maxLength={80}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.country_hint')}</p>
          </div>

          <div>
            <FormField
              label={t('profile.club')}
              type="text"
              maxLength={80}
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              disabled={saving}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.club_hint')}</p>
          </div>

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

          <Button type="submit" size="md" className="w-full" disabled={saving || !dirty}>
            {saving ? t('auth.profile.saving') : t('auth.profile.save')}
          </Button>
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
  const navigate = useNavigate();

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
          <Button variant="secondary" onClick={() => navigate(ROUTE_PATH.HOME)}>
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
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-accent-fg"
            >
              {extractInitial(profile.nickname)}
            </span>
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
            {profile.country && <Row label={t('public_profile.country')} value={profile.country} />}
            {profile.clubName && <Row label={t('public_profile.club')} value={profile.clubName} />}
          </dl>

          {joinedRel && (
            <p className="text-xs text-muted">
              {t('public_profile.joined')}: {joinedRel}
            </p>
          )}

          <p className="pt-1 text-sm">
            <Link to={ROUTE_PATH.HOME} className="text-muted hover:text-fg hover:underline">
              ← {t('common.back')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}
