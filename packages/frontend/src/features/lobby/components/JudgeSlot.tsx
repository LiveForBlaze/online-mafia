// Card showing the judge slot above the player grid.

import type { LobbyMemberPublic } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface JudgeSlotProps {
  judge: LobbyMemberPublic | undefined;
  currentUserId: string;
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
}

export function JudgeSlot({
  judge,
  currentUserId,
  canKick,
  onKick,
  isKickPending,
}: JudgeSlotProps) {
  return (
    <div className="rounded-md border border-border bg-card p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">{LOBBY_MESSAGES.room.judge}</p>
        {judge ? (
          <p className="mt-1 text-sm font-medium text-fg">
            {judge.nickname}
            {judge.userId === currentUserId && (
              <span className="ml-2 text-xs text-muted">(вы)</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">{LOBBY_MESSAGES.room.judgeSlotEmpty}</p>
        )}
      </div>

      {judge && canKick && judge.userId !== currentUserId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onKick(judge.userId)}
          disabled={isKickPending}
        >
          {LOBBY_MESSAGES.room.kick}
        </Button>
      )}
    </div>
  );
}
