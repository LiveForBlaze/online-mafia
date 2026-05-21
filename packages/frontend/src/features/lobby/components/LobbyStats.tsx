// Compact stats strip shown under the lobby list header.
// All numbers are derived from the currently-visible lobby list — no extra
// API call. Single row on desktop, wraps on mobile.

import { useTranslation } from 'react-i18next';

import type { LobbySummary } from '@mafia/shared';

interface LobbyStatsProps {
  lobbies: ReadonlyArray<LobbySummary>;
}

export function LobbyStats({ lobbies }: LobbyStatsProps) {
  const { t } = useTranslation();
  const openCount = lobbies.length;
  const waitingCount = lobbies.reduce((sum, lobby) => sum + lobby.memberCount, 0);
  const privateCount = lobbies.reduce((sum, lobby) => sum + (lobby.isPrivate ? 1 : 0), 0);

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted"
      aria-label={t('lobby.list.statsAria')}
    >
      <Stat dotClass="bg-accent" label={t('lobby.list.statsOpen', { count: openCount })} />
      <span aria-hidden="true" className="hidden sm:inline text-border">
        ·
      </span>
      <Stat dotClass="bg-success" label={t('lobby.list.statsWaiting', { count: waitingCount })} />
      <span aria-hidden="true" className="hidden sm:inline text-border">
        ·
      </span>
      <Stat dotClass="bg-warning" label={t('lobby.list.statsPrivate', { count: privateCount })} />
    </div>
  );
}

function Stat({ dotClass, label }: { dotClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-fg">{label}</span>
    </span>
  );
}
