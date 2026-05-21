// Card representing a single lobby in the public list.
// Clicking the card (or pressing Enter/Space while it is focused) triggers
// the parent's join flow. For private lobbies the parent opens a password
// dialog; for public ones it joins directly.
//
// V2 layout: avatar (left) · title + meta chips + progress bar (middle) · primary CTA (right).

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { LobbySummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';
import { formatRelativeTime } from '@/features/lobby/lib/relativeTime.js';
import { userProfilePath } from '@/routes/paths.js';

interface LobbyCardProps {
  lobby: LobbySummary;
  onJoin: () => void;
  isJoining?: boolean;
}

export function LobbyCard({ lobby, onJoin, isJoining }: LobbyCardProps) {
  const { t } = useTranslation();
  const ratio =
    lobby.maxMembers > 0 ? Math.min(1, Math.max(0, lobby.memberCount / lobby.maxMembers)) : 0;
  const percent = Math.round(ratio * 100);
  const createdLabel = formatRelativeTime(lobby.createdAt);

  function triggerJoin() {
    if (!isJoining) onJoin();
  }

  function handleRowClick(event: MouseEvent<HTMLDivElement>) {
    // The inner Button stops propagation on its own click, so anything that
    // reaches this handler is a click on the row chrome — treat it as a join.
    if (event.defaultPrevented) return;
    triggerJoin();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Only react to Enter/Space when the focus is on the row itself, not on
    // a button nested inside it (Buttons handle their own keys).
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerJoin();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      aria-label={t('lobby.card.ariaLabel', { name: lobby.name, host: lobby.hostNickname })}
      className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-accent/40 hover:bg-card-deep focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg"
    >
      <div className="flex items-center gap-3 p-4">
        <Avatar nickname={lobby.hostNickname} />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-fg sm:text-lg">{lobby.name}</h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            <span>{t('lobby.card.hostPrefix')}</span>
            {lobby.hostPublicCode ? (
              <Link
                to={userProfilePath(lobby.hostPublicCode)}
                // The card-wide click handler treats anything that bubbles up as
                // a "join" intent. Stop the link click from reaching it so the
                // navigation goes to the host profile, not into the lobby.
                onClick={(event) => event.stopPropagation()}
                className="text-fg/80 hover:underline"
              >
                {lobby.hostNickname}
              </Link>
            ) : (
              <span className="text-fg/80">{lobby.hostNickname}</span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>
              {t('lobby.card.membersShort', {
                current: lobby.memberCount,
                max: lobby.maxMembers,
              })}
            </Chip>
            <PrivacyBadge isPrivate={lobby.isPrivate} />
            {createdLabel && <Chip tone="muted">{createdLabel}</Chip>}
          </div>
        </div>

        <div className="shrink-0">
          <Button
            onClick={(event) => {
              // Don't let the row's click handler fire a second time.
              event.stopPropagation();
              triggerJoin();
            }}
            disabled={isJoining}
            variant={lobby.isViewerMember ? 'secondary' : 'primary'}
            size="sm"
          >
            {lobby.isViewerMember ? t('lobby.card.continue') : t('lobby.card.join')}
          </Button>
        </div>
      </div>

      {/* Capacity track at the bottom of the card. Thin, unobtrusive, but
          gives a quick visual read of how full a lobby is. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('lobby.card.membersOf', {
          current: lobby.memberCount,
          max: lobby.maxMembers,
        })}
        className="h-1 w-full bg-card-deep"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Avatar({ nickname }: { nickname: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg"
    >
      {extractInitial(nickname)}
    </span>
  );
}

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'muted' }) {
  const toneClass = tone === 'muted' ? 'bg-card-deep text-muted' : 'bg-card-deep text-fg';
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ${toneClass}`}>
      {children}
    </span>
  );
}

function PrivacyBadge({ isPrivate }: { isPrivate: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={
        isPrivate
          ? 'inline-flex items-center rounded-md bg-team-black/20 px-1.5 py-0.5 text-xs text-fg'
          : 'inline-flex items-center rounded-md bg-success/20 px-1.5 py-0.5 text-xs text-fg'
      }
    >
      {isPrivate ? t('lobby.card.private') : t('lobby.card.public')}
    </span>
  );
}
