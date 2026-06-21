// Grid of 10 player seats. Each tile is an elevated portrait-oriented seat
// CARD: a dominant avatar, the seat number in the top-left corner, the
// nickname below, and small host/bot badges.
//
// Readiness is shown with BOTH a glyph and colour so it stays glanceable for
// colourblind users (never colour alone):
//   - dashed muted outline + "+" placeholder -> empty
//   - CheckCircle glyph + success accent      -> seated AND ready
//   - Circle (hollow) glyph + danger accent   -> seated, NOT ready
// The ready button itself is rendered outside this grid in LobbyRoom.

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bot, CheckCircle2, Circle, Crown } from 'lucide-react';

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
      <div
        className="group relative flex aspect-[3/4] flex-col rounded-xl border border-dashed border-border bg-card-deep/40 p-2 transition-colors hover:border-border/80"
        aria-label={t('lobby.room.seatEmpty')}
      >
        <span className="text-base font-semibold text-muted tabular-nums">{seat}</span>
        <div className="flex flex-1 items-center justify-center">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border/70 text-lg leading-none text-muted/70"
          >
            +
          </span>
        </div>
      </div>
    );
  }

  const ready = occupant.isReady;
  const borderColor = ready ? 'border-success/70' : 'border-danger/60';
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
        'hover-lift group relative flex aspect-[3/4] flex-col rounded-xl border-2 bg-card p-2 shadow-elev',
        borderColor,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn('text-base font-bold tabular-nums leading-none', numberColor)}>
          {seat}
        </span>
        <div className="flex items-center gap-1">
          {occupant.isHost && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-warning"
              title={t('lobby.room.hostBadge')}
            >
              <Crown className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="sr-only">{t('lobby.room.hostBadge')}</span>
            </span>
          )}
          {occupant.isBot && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-card-deep px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted"
              title={t('lobby.room.botBadge')}
            >
              <Bot className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="sr-only">{t('lobby.room.botBadge')}</span>
            </span>
          )}
        </div>
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

      {/* Readiness cue — glyph + colour together (never colour alone) so the
          ready state is legible for colourblind users. */}
      <div
        className={cn(
          'mt-1 flex items-center justify-center gap-1 text-2xs font-semibold uppercase tracking-wide',
          ready ? 'text-success' : 'text-muted',
        )}
      >
        {ready ? (
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Circle className="h-3 w-3" aria-hidden="true" />
        )}
        <span>{ready ? t('lobby.room.readyLabel') : t('lobby.room.notReadyLabel')}</span>
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
            'text-2xs text-muted focus:outline-none focus:ring-1 focus:ring-accent',
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
