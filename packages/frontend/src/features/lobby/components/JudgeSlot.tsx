// Compact judge card above the player grid. Just nickname + avatar; no
// "host" / "non-transferable" labels — those are implicit and the user
// has feedback that the long-form copy was clutter.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { LobbyMemberPublic } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { userProfilePath } from '@/routes/paths.js';

interface JudgeSlotProps {
  judge: LobbyMemberPublic | undefined;
  currentUserId: string;
  // Kept for callsite symmetry with SeatGrid even though the judge can't
  // be kicked — leaving collapses the whole lobby.
  canKick?: boolean;
  onKick?: (userId: string) => void;
  isKickPending?: boolean;
}

export function JudgeSlot({ judge, currentUserId }: JudgeSlotProps) {
  const { t } = useTranslation();
  const isViewer = judge?.userId === currentUserId;

  return (
    <div className="rounded-md border border-border bg-card-deep px-3 py-2 flex items-center gap-3">
      <span className="text-2xs uppercase tracking-wider text-muted shrink-0" aria-hidden="true">
        {t('lobby.room.judgeUpper')}
      </span>
      {judge ? (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-semibold"
            aria-hidden="true"
          >
            {extractInitial(judge.nickname)}
          </span>
          <p className="text-sm font-medium text-fg truncate">
            {judge.publicCode ? (
              <Link to={userProfilePath(judge.publicCode)} className="hover:underline">
                {judge.nickname}
              </Link>
            ) : (
              judge.nickname
            )}
            {isViewer && <span className="ml-1 text-xs text-muted">({t('lobby.room.you')})</span>}
          </p>
          {judge.isReady && (
            <span
              className={cn(
                'shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-success',
              )}
              aria-label={t('lobby.room.readyLabel')}
            >
              ✓ {t('lobby.room.readyLabel')}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{t('lobby.room.judgeSlotEmpty')}</p>
      )}
    </div>
  );
}
