// Card representing a single lobby in the public list.
// Clicking the card triggers the parent's join flow — for public lobbies it joins directly,
// for private ones it opens a password dialog.

import type { LobbySummary } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface LobbyCardProps {
  lobby: LobbySummary;
  onJoin: () => void;
  isJoining?: boolean;
}

export function LobbyCard({ lobby, onJoin, isJoining }: LobbyCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-fg truncate">{lobby.name}</h3>
          <PrivacyBadge isPrivate={lobby.isPrivate} />
        </div>
        <p className="mt-1 text-sm text-muted truncate">
          {LOBBY_MESSAGES.card.host}: {lobby.hostNickname}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {LOBBY_MESSAGES.card.membersOf(lobby.memberCount, lobby.maxMembers)}
        </p>
      </div>
      <Button
        onClick={onJoin}
        disabled={isJoining}
        variant={lobby.isViewerMember ? 'secondary' : 'primary'}
        size="sm"
      >
        {lobby.isViewerMember ? LOBBY_MESSAGES.card.continue : LOBBY_MESSAGES.card.join}
      </Button>
    </div>
  );
}

function PrivacyBadge({ isPrivate }: { isPrivate: boolean }) {
  return (
    <span
      className={
        isPrivate
          ? 'inline-flex items-center rounded-md bg-team-black/20 px-1.5 py-0.5 text-xs text-fg'
          : 'inline-flex items-center rounded-md bg-success/20 px-1.5 py-0.5 text-xs text-fg'
      }
    >
      {isPrivate ? LOBBY_MESSAGES.card.private : LOBBY_MESSAGES.card.public}
    </span>
  );
}
