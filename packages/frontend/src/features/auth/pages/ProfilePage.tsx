// Profile page. The only editable field today is the nickname — email and
// avatarUrl are read-only (changing email requires a verification flow that is
// not built yet).
//
// Visible to authenticated users only (registered via AuthGuard in App.tsx).

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/Button.js';
import { FormField } from '@/components/ui/FormField.js';
import { ThemeToggle } from '@/components/ui/ThemeToggle.js';
import { ApiError } from '@/lib/api-client.js';
import {
  authErrorMessage,
  AUTH_MESSAGES,
} from '@/features/auth/messages.js';
import { useUpdateNickname } from '@/features/auth/hooks/useAuth.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateNickname = useUpdateNickname();

  // Keep a local draft so the input is controlled while the user types,
  // but reset it whenever the underlying user changes (e.g. after save).
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [savedRecently, setSavedRecently] = useState(false);

  useEffect(() => {
    if (user) setNickname(user.nickname);
  }, [user]);

  if (!user) return null;

  const trimmed = nickname.trim();
  const isUnchanged = trimmed === user.nickname;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUnchanged) return;

    updateNickname.mutate(
      { nickname: trimmed },
      {
        onSuccess: () => {
          setSavedRecently(true);
          // Brief positive feedback — fades on next interaction.
          window.setTimeout(() => setSavedRecently(false), 2000);
        },
      },
    );
  }

  const errorMessage = updateNickname.isError
    ? extractErrorMessage(updateNickname.error)
    : null;

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-md space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-fg">{AUTH_MESSAGES.profile.title}</h1>
          <div className="flex gap-2 items-center">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => navigate(ROUTE_PATH.HOME)}>
              {AUTH_MESSAGES.profile.back}
            </Button>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-card p-6 space-y-4"
          noValidate
        >
          <FormField
            label={AUTH_MESSAGES.profile.emailLabel}
            type="email"
            value={user.email}
            disabled
            onChange={() => undefined}
          />

          <div>
            <FormField
              label={AUTH_MESSAGES.profile.nicknameLabel}
              type="text"
              autoComplete="nickname"
              required
              minLength={2}
              maxLength={24}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              disabled={updateNickname.isPending}
            />
            <p className="mt-1 text-xs text-muted">{AUTH_MESSAGES.profile.nicknameHint}</p>
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage}
            </p>
          )}

          {savedRecently && !updateNickname.isError && (
            <p role="status" className="text-sm text-accent">
              {AUTH_MESSAGES.profile.saved}
            </p>
          )}

          <Button
            type="submit"
            size="md"
            className="w-full"
            disabled={updateNickname.isPending || isUnchanged}
          >
            {updateNickname.isPending
              ? AUTH_MESSAGES.profile.saving
              : AUTH_MESSAGES.profile.save}
          </Button>
        </form>

        <p className="text-center text-sm text-muted">
          <Link to={ROUTE_PATH.HOME} className="hover:underline">
            {AUTH_MESSAGES.profile.back}
          </Link>
        </p>
      </div>
    </main>
  );
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return authErrorMessage(error.body.error);
  }
  return authErrorMessage(undefined);
}
