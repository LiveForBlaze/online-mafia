// Profile page — the authenticated user's own account.
//
// Read-only: email (changing it requires a verification flow we haven't built).
// Editable nickname uses its own mutation because the backend exposes a
// dedicated endpoint with collision detection. Real name / country / club are
// grouped together because they share a single PATCH endpoint and are all
// optional public-profile fields.
//
// A read-only "your code" chip exposes the user's public-profile handle so they
// can share it. The destructive "Delete account" block lives at the bottom and
// requires retyping the account email to confirm.

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { FormField } from '@/components/ui/FormField.js';
import { ApiError } from '@/lib/api-client.js';
import {
  useAuthErrorMessage,
  useDeleteAccount,
  useLogout,
  useUpdateNickname,
  useUpdateProfile,
} from '@/features/auth/hooks/useAuth.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateNickname = useUpdateNickname();
  const updateProfile = useUpdateProfile();
  const deleteAccount = useDeleteAccount();
  const logout = useLogout();
  const authErrorMessage = useAuthErrorMessage();

  // Keep local drafts so the inputs stay controlled while typing, and reset
  // them whenever the underlying user changes (after a successful save the
  // server-returned user becomes the new baseline).
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [realName, setRealName] = useState(user?.realName ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [clubName, setClubName] = useState(user?.clubName ?? '');
  const [nickSavedRecently, setNickSavedRecently] = useState(false);
  const [profileSavedRecently, setProfileSavedRecently] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname);
    setRealName(user.realName ?? '');
    setCountry(user.country ?? '');
    setClubName(user.clubName ?? '');
  }, [user]);

  if (!user) return null;

  const nickTrimmed = nickname.trim();
  const isNickUnchanged = nickTrimmed === user.nickname;

  // Compare drafts to the current user, treating empty strings as "cleared"
  // (matches the backend semantics — passing "" trims to null).
  const profileDirty =
    realName.trim() !== (user.realName ?? '') ||
    country.trim() !== (user.country ?? '') ||
    clubName.trim() !== (user.clubName ?? '');

  function handleNicknameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNickUnchanged) return;
    updateNickname.mutate(
      { nickname: nickTrimmed },
      {
        onSuccess: () => {
          setNickSavedRecently(true);
          window.setTimeout(() => setNickSavedRecently(false), 2000);
        },
      },
    );
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileDirty) return;
    // Empty inputs map to null so the user can actually clear a previously
    // set field; the server treats null the same way.
    updateProfile.mutate(
      {
        realName: realName.trim() === '' ? null : realName.trim(),
        country: country.trim() === '' ? null : country.trim(),
        clubName: clubName.trim() === '' ? null : clubName.trim(),
      },
      {
        onSuccess: () => {
          setProfileSavedRecently(true);
          window.setTimeout(() => setProfileSavedRecently(false), 2000);
        },
      },
    );
  }

  const publicCode = user.publicCode;
  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(publicCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // Clipboard access can fail in insecure contexts — fall back silently.
    }
  }

  function extractErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return authErrorMessage(error.body.error);
    return authErrorMessage(undefined);
  }

  const nickError = updateNickname.isError ? extractErrorMessage(updateNickname.error) : null;
  const profileError = updateProfile.isError ? extractErrorMessage(updateProfile.error) : null;
  const deleteError = deleteAccount.isError ? extractErrorMessage(deleteAccount.error) : null;

  const confirmMatches = confirmEmail.trim().toLowerCase() === user.email.trim().toLowerCase();

  function handleDeleteConfirm() {
    if (!confirmMatches) return;
    deleteAccount.mutate(
      { confirmEmail: confirmEmail.trim() },
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
        <h1 className="text-2xl font-bold text-fg">{t('auth.profile.title')}</h1>

        <form
          onSubmit={handleNicknameSubmit}
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
              disabled={updateNickname.isPending}
            />
            <p className="mt-1 text-xs text-muted">{t('auth.profile.nicknameHint')}</p>
          </div>

          {nickError && (
            <p role="alert" className="text-sm text-danger">
              {nickError}
            </p>
          )}

          {nickSavedRecently && !updateNickname.isError && (
            <p role="status" className="text-sm text-accent">
              {t('auth.profile.saved')}
            </p>
          )}

          <Button
            type="submit"
            size="md"
            className="w-full"
            disabled={updateNickname.isPending || isNickUnchanged}
          >
            {updateNickname.isPending ? t('auth.profile.saving') : t('auth.profile.save')}
          </Button>
        </form>

        {/* "Your code" — read-only handle for sharing the public profile link. */}
        <div className="rounded-lg border border-border bg-card p-6 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted">{t('profile.code_label')}</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate rounded-md bg-card-deep px-3 py-2 font-mono text-sm text-fg">
              {user.publicCode}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleCopyCode}
              disabled={codeCopied}
            >
              {codeCopied ? t('profile.copy_code_done') : t('profile.copy_code')}
            </Button>
          </div>
        </div>

        <form
          onSubmit={handleProfileSubmit}
          className="rounded-lg border border-border bg-card p-6 space-y-4"
          noValidate
        >
          <div>
            <FormField
              label={t('profile.real_name')}
              type="text"
              maxLength={80}
              value={realName}
              onChange={(event) => setRealName(event.target.value)}
              disabled={updateProfile.isPending}
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
              disabled={updateProfile.isPending}
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
              disabled={updateProfile.isPending}
            />
            <p className="mt-1 text-xs text-muted">{t('profile.club_hint')}</p>
          </div>

          {profileError && (
            <p role="alert" className="text-sm text-danger">
              {profileError}
            </p>
          )}

          {profileSavedRecently && !updateProfile.isError && (
            <p role="status" className="text-sm text-accent">
              {t('auth.profile.saved')}
            </p>
          )}

          <Button
            type="submit"
            size="md"
            className="w-full"
            disabled={updateProfile.isPending || !profileDirty}
          >
            {updateProfile.isPending ? t('auth.profile.saving') : t('auth.profile.save')}
          </Button>
        </form>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="text-sm text-danger hover:underline disabled:opacity-60"
          >
            {logout.isPending ? t('auth.profile.loggingOut') : t('auth.profile.logout')}
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {t('profile.danger_zone')}
          </h2>
          <button
            type="button"
            onClick={() => {
              setConfirmEmail('');
              deleteAccount.reset();
              setDeleteOpen(true);
            }}
            className="text-sm text-danger hover:underline"
          >
            {t('profile.delete_account')}
          </button>
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
        {deleteError && (
          <p role="alert" className="text-sm text-danger">
            {deleteError}
          </p>
        )}
      </Dialog>
    </div>
  );
}
