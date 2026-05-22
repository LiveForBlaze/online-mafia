// Grid of 10 player seats. Each tile is portrait-oriented: a dominant avatar,
// the seat number in the top-left corner, and the nickname below.
//
// The whole tile reads its state through the border colour so a filled-vs-empty
// (and ready-vs-not) read is instant at any glance:
//   - dashed muted outline  -> empty
//   - solid green border    -> seated AND ready
//   - solid red border      -> seated, NOT ready
// The ready button itself is rendered outside this grid in LobbyRoom.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { GAME, ROLE, type LobbyMemberPublic, type Role } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { userProfilePath } from '@/routes/paths.js';

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
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
      {seats.map((seat) => {
        const occupant = memberBySeat.get(seat);
        return (
          <SeatCard
            key={seat}
            seat={seat}
            occupant={occupant}
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
  canKick: boolean;
  onKick: (userId: string) => void;
  isKickPending?: boolean;
  onPreassignRole?: (userId: string, role: Role | null) => void;
  isPreassignPending?: boolean;
}

function SeatCard({
  seat,
  occupant,
  canKick,
  onKick,
  isKickPending,
  onPreassignRole,
  isPreassignPending,
}: SeatCardProps) {
  const { t } = useTranslation();

  if (!occupant) {
    return (
      <div className="group relative flex aspect-[3/4] flex-col rounded-lg border border-dashed border-border bg-card-deep/30 p-2">
        <span className="text-base font-semibold text-muted tabular-nums">{seat}</span>
        <div className="flex flex-1 items-center justify-center">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-lg leading-none text-muted/70"
          >
            +
          </span>
        </div>
      </div>
    );
  }

  const ready = occupant.isReady;
  const borderColor = ready ? 'border-success/70' : 'border-danger/70';
  const numberColor = ready ? 'text-success' : 'text-danger';
  const showRolePicker = Boolean(onPreassignRole);

  const preassignOptions: { value: Role | ''; label: string }[] = [
    { value: '', label: t('lobby.room.preassignRandom') },
    { value: ROLE.CIVILIAN, label: t('game.role.civilian') },
    { value: ROLE.SHERIFF, label: t('game.role.sheriff') },
    { value: ROLE.MAFIA, label: t('game.role.mafia') },
    { value: ROLE.DON, label: t('game.role.don') },
  ];

  return (
    <div
      className={cn(
        'group relative flex aspect-[3/4] flex-col rounded-lg border-2 bg-card p-2',
        borderColor,
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn('text-base font-bold tabular-nums leading-none', numberColor)}>
          {seat}
        </span>
        {canKick && (
          <button
            type="button"
            onClick={() => onKick(occupant.userId)}
            disabled={isKickPending}
            title={t('lobby.room.kickTitle')}
            aria-label={t('lobby.room.kickTitle')}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted opacity-0 transition group-hover:opacity-100',
              'hover:bg-bg hover:text-danger focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-accent',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <KickIcon />
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-1 items-center justify-center">
        <div className="aspect-square w-full max-w-[88%] overflow-hidden rounded-md">
          <Avatar
            avatarUrl={occupant.avatarUrl}
            nickname={occupant.nickname}
            size={null}
            shape="square"
          />
        </div>
      </div>

      <div className="mt-1.5 text-center">
        {occupant.publicCode ? (
          <Link
            to={userProfilePath(occupant.publicCode)}
            className="block truncate text-xs font-semibold uppercase tracking-wide text-fg hover:underline"
          >
            {occupant.nickname}
          </Link>
        ) : (
          <span className="block truncate text-xs font-semibold uppercase tracking-wide text-fg">
            {occupant.nickname}
          </span>
        )}
      </div>

      {showRolePicker && onPreassignRole && (
        <select
          value={occupant.preassignedRole ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onPreassignRole(occupant.userId, v === '' ? null : (v as Role));
          }}
          disabled={isPreassignPending}
          title={t('lobby.room.preassignTitle')}
          className={cn(
            'mt-1 w-full rounded-sm border border-border bg-card-deep px-1 py-0.5',
            'text-[10px] text-muted focus:outline-none focus:ring-1 focus:ring-accent',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {preassignOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function KickIcon() {
  return (
    <svg
      width="10"
      height="10"
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
