// Read-only public profile at /user?id=<publicCode> for someone other than
// the viewer. Loads the public profile by code, renders the display fields,
// the stats block, achievements, and a back affordance.

import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { type PublicUserProfile } from '@mafia/shared';

import { AchievementBadge } from '@/components/ui/AchievementBadge.js';
import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { CountryLabel } from '@/components/ui/CountryLabel.js';
import { cn } from '@/lib/cn.js';
import { ApiError } from '@/lib/api-client.js';
import { authApi } from '@/features/auth/api/auth.api.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';
import { useGoBack } from '@/lib/use-go-back.js';
import { ROUTE_PATH } from '@/routes/paths.js';

export function PublicProfileView({ code }: { code: string }) {
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
              <h1 className="truncate text-2xl font-bold text-fg">{profile.nickname}</h1>
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
        className={cn(
          'font-semibold tabular-nums',
          small ? 'text-sm text-fg' : 'text-xl text-fg leading-none',
        )}
      >
        {value}
      </p>
      <p className="text-2xs uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
