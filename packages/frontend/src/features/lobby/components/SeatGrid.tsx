// Grid of 10 player seats. Each seat shows either the seated player's nickname or
// "free". Host gets a small badge; the current viewer gets a faint highlight.

import { GAME, ROLE, type LobbyMemberPublic, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { LOBBY_MESSAGES } from '@/features/lobby/messages.js';
import { extractInitial } from '@/features/lobby/lib/extractInitial.js';

interface SeatGridProps {
  members: LobbyMemberPublic[];
  currentUserId: string;
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
  // Host-only: pre-assign a role to a member. Pass null in the role to clear.
  // Undefined disables the picker entirely (non-host viewers).
  onPreassignRole?: (userId: string, role: Role | null) => void;
  isPreassignPending?: boolean;
}

export function SeatGrid({
  members,
  currentUserId,
  canKick,
  onKick,
  isKickPending,
  onPreassignRole,
  isPreassignPending,
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
            onPreassignRole={onPreassignRole}
            isPreassignPending={isPreassignPending}
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
  onPreassignRole?: (userId: string, role: Role | null) => void;
  isPreassignPending?: boolean;
}

const PREASSIGN_OPTIONS: { value: Role | ''; label: string }[] = [
  { value: '', label: 'Случайно' },
  { value: ROLE.CIVILIAN, label: 'Мирный' },
  { value: ROLE.SHERIFF, label: 'Шериф' },
  { value: ROLE.MAFIA, label: 'Мафия' },
  { value: ROLE.DON, label: 'Дон' },
];

function SeatCard({
  seat,
  occupant,
  isCurrentUser,
  canKick,
  onKick,
  isKickPending,
  onPreassignRole,
  isPreassignPending,
}: SeatCardProps) {
  const showRolePicker = Boolean(occupant && onPreassignRole);
  return (
    <div
      className={cn(
        'relative rounded-md border p-3 min-h-[112px] flex flex-col gap-2',
        occupant
          ? 'border-border bg-card'
          : 'border-dashed border-border bg-card-deep/40 opacity-90',
        isCurrentUser && 'ring-2 ring-accent',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-fg tabular-nums">{seat}</span>
        {occupant?.isHost && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            {LOBBY_MESSAGES.room.hostBadge}
          </span>
        )}
      </div>

      {occupant ? (
        <>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                isCurrentUser ? 'bg-accent/20 text-accent' : 'bg-card-deep text-muted',
              )}
              aria-hidden="true"
            >
              {extractInitial(occupant.nickname)}
            </span>
            <span className="text-sm font-medium text-fg truncate min-w-0">
              {occupant.nickname}
            </span>
            {canKick && (
              <button
                type="button"
                onClick={() => onKick(occupant.userId)}
                disabled={isKickPending}
                title={LOBBY_MESSAGES.room.kickTitle}
                aria-label={LOBBY_MESSAGES.room.kickTitle}
                className={cn(
                  'ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  'text-muted hover:bg-bg hover:text-danger transition',
                  'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <KickIcon />
              </button>
            )}
          </div>
          {showRolePicker && occupant && onPreassignRole && (
            <select
              value={occupant.preassignedRole ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onPreassignRole(occupant.userId, v === '' ? null : (v as Role));
              }}
              disabled={isPreassignPending}
              title="Назначить роль (dev)"
              className={cn(
                'mt-auto w-full rounded-sm border border-border bg-card-deep px-1.5 py-1',
                'text-[11px] text-muted focus:outline-none focus:ring-2 focus:ring-accent',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {PREASSIGN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 text-muted">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-base leading-none"
            aria-hidden="true"
          >
            +
          </span>
          <span className="text-sm">{LOBBY_MESSAGES.room.seatEmpty}</span>
        </div>
      )}
    </div>
  );
}

function KickIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
