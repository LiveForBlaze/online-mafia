// Grid of 10 player seats. Each seat shows either the seated player's nickname or
// "free". Host gets a small badge; the current viewer gets a faint highlight.

import { GAME, type LobbyMemberPublic } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';

interface SeatGridProps {
  members: LobbyMemberPublic[];
  currentUserId: string;
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
}

export function SeatGrid({
  members,
  currentUserId,
  canKick,
  onKick,
  isKickPending,
}: SeatGridProps) {
  const memberBySeat = new Map<number, LobbyMemberPublic>();
  for (const member of members) {
    if (!member.isJudge && member.seat !== null) {
      memberBySeat.set(member.seat, member);
    }
  }

  const seats: number[] = [];
  for (let seat = GAME.FIRST_SEAT; seat <= GAME.LAST_SEAT; seat += 1) {
    seats.push(seat);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {seats.map((seat) => {
        const occupant = memberBySeat.get(seat);
        return (
          <SeatCard
            key={seat}
            seat={seat}
            occupant={occupant}
            isCurrentUser={occupant?.userId === currentUserId}
            canKick={canKick && occupant !== undefined && occupant.userId !== currentUserId}
            onKick={onKick}
            isKickPending={isKickPending}
          />
        );
      })}
    </div>
  );
}

interface SeatCardProps {
  seat: number;
  occupant: LobbyMemberPublic | undefined;
  isCurrentUser: boolean;
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
}

function SeatCard({
  seat,
  occupant,
  isCurrentUser,
  canKick,
  onKick,
  isKickPending,
}: SeatCardProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 min-h-[88px] flex flex-col gap-1',
        occupant ? 'border-border bg-card' : 'border-dashed border-border bg-bg',
        isCurrentUser && 'ring-2 ring-accent',
      )}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{LOBBY_MESSAGES.room.seatLabel(seat)}</span>
        {occupant?.isHost && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            {LOBBY_MESSAGES.room.hostBadge}
          </span>
        )}
      </div>

      {occupant ? (
        <>
          <span className="text-sm font-medium text-fg truncate">{occupant.nickname}</span>
          {canKick && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-auto h-7 text-xs"
              onClick={() => onKick(occupant.userId)}
              disabled={isKickPending}
            >
              {LOBBY_MESSAGES.room.kick}
            </Button>
          )}
        </>
      ) : (
        <span className="text-sm text-muted">{LOBBY_MESSAGES.room.seatEmpty}</span>
      )}
    </div>
  );
}
