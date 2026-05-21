// Public profile page (route /u/:code).
//
// Reads the user by their public code via authApi.getPublicUser. The endpoint
// returns the sanitized profile shape (no email, no internal flags). When the
// viewed profile happens to be the current viewer we surface a small
// "edit your profile" link — otherwise the page is purely read-only.

import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button.js';
import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function PublicProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ code: string }>();
  const code = params.code ?? '';
  const viewer = useAuthStore((state) => state.user);

  const query = useQuery({
    queryKey: ['public-user', code],
    queryFn: () => authApi.getPublicUser(code),
    enabled: Boolean(code),
    // 404 is a stable answer — no need to retry.
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

  const isSelf = viewer?.id === profile.id;
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
                {t('public_profile.code_label')}: {profile.publicCode}
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

          {isSelf && (
            <p className="pt-2 text-sm">
              <Link to={ROUTE_PATH.PROFILE} className="text-accent hover:underline">
                {t('public_profile.edit_link')}
              </Link>
            </p>
          )}
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
