// Card showing the judge slot above the player grid. Visually prominent because
// the judge is the lobby host and the slot is irreplaceable.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { LobbyMemberPublic } from '@mafia/shared';

import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { publicUserPath } from '@/routes/paths.js';

interface JudgeSlotProps {
  judge: LobbyMemberPublic | undefined;
  currentUserId: string;
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
}

export function JudgeSlot({ judge, currentUserId }: JudgeSlotProps) {
  const { t } = useTranslation();
  // The judge slot intentionally has no kick affordance: the judge is the lobby
  // host, the role is non-transferable, and leaving closes the lobby. We accept
  // canKick / onKick / isKickPending props for callsite symmetry with SeatGrid.
  const isViewer = judge?.userId === currentUserId;

  return (
    <div className="rounded-md border border-border bg-card-deep p-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {judge ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg text-sm font-semibold"
            aria-hidden="true"
          >
            {extractInitial(judge.nickname)}
          </span>
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted text-sm"
            aria-hidden="true"
          >
            ?
          </span>
        )}

        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted">
            {t('lobby.room.judgeUpper')}
          </p>
          {judge ? (
            <p className="mt-0.5 text-sm font-medium text-fg truncate">
              {judge.publicCode ? (
                <Link to={publicUserPath(judge.publicCode)} className="hover:underline">
                  {judge.nickname}
                </Link>
              ) : (
                judge.nickname
              )}
              {isViewer && <span className="ml-2 text-xs text-muted">({t('lobby.room.you')})</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">{t('lobby.room.judgeSlotEmpty')}</p>
          )}
          <p className="mt-0.5 text-[11px] text-muted">{t('lobby.room.judgeNonTransferable')}</p>
        </div>
      </div>

      {judge && (
        <span className="shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
          {t('lobby.room.hostBadge')}
        </span>
      )}
    </div>
  );
}
