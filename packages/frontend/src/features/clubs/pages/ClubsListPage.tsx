// /clubs — list + search + create. Each card shows current viewer-status
// (none/pending/member/head) as an action button on the right.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { MAX_CLUBS_PER_USER, type ClubSummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { ErrorState } from '@/components/ui/ErrorState.js';
import { Skeleton } from '@/components/ui/Skeleton.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useDebouncedValue } from '@/lib/useDebouncedValue.js';
import { useClubsList } from '@/features/clubs/hooks/useClubs.js';
import { CreateClubDialog } from '@/features/clubs/components/CreateClubDialog.js';
import { clubDetailPath } from '@/routes/paths.js';

export function ClubsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const query = useClubsList(debouncedSearch);
  // Из /auth/me знаем сколько клубов у юзера. Используем чтобы дизейблить
  // CTA "Войти" и "Создать клуб" когда лимит достигнут.
  const memberships = useAuthStore((s) => s.user?.clubMemberships ?? []);
  const atMaxClubs = memberships.length >= MAX_CLUBS_PER_USER;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">{t('clubs.title')}</h1>
          <p className="text-sm text-muted">{t('clubs.subtitle')}</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={atMaxClubs}
          title={
            atMaxClubs
              ? t('clubs.errors.max_clubs_reached', { max: MAX_CLUBS_PER_USER })
              : undefined
          }
        >
          + {t('clubs.createCta')}
        </Button>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('clubs.search.placeholder')}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
      />

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={74} className="rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => query.refetch()}
        />
      ) : query.data.clubs.length === 0 ? (
        <p className="text-center text-muted py-10">{t('clubs.list.empty')}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {query.data.clubs.map((c) => (
            <ClubCard key={c.id} club={c} atMaxClubs={atMaxClubs} />
          ))}
        </div>
      )}

      <CreateClubDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(code) => {
          setCreateOpen(false);
          navigate(clubDetailPath(code));
        }}
      />
    </div>
  );
}

function ClubCard({ club, atMaxClubs }: { club: ClubSummary; atMaxClubs: boolean }) {
  const { t } = useTranslation();
  // Если юзер уже в MAX_CLUBS_PER_USER клубах и это не его клуб — он не
  // может подать заявку. Показываем disabled-метку вместо primary кнопки.
  const cannotJoin = club.viewerStatus === 'none' && atMaxClubs;
  const actionKey = cannotJoin ? 'clubs.actions.maxReached' : `clubs.actions.${club.viewerStatus}`;
  const detailHref = clubDetailPath(club.publicCode);
  return (
    <Link
      to={detailHref}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 hover:bg-bg/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-fg truncate">{club.name}</div>
        <div className="mt-0.5 text-xs text-muted truncate">
          {t('clubs.list.headBy', { nickname: club.headNickname })} ·{' '}
          {t('clubs.list.members', { count: club.memberCount })}
        </div>
      </div>
      <span
        className={
          club.viewerStatus === 'none' && !cannotJoin
            ? 'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg'
            : 'rounded-md border border-border px-3 py-1.5 text-xs text-muted'
        }
      >
        {t(actionKey)}
      </span>
    </Link>
  );
}
