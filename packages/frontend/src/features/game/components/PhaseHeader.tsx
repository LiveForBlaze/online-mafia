// Page header showing the current phase, day number, and the viewer's own role.

import { TEAM, type GameStateProjected, type Role } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { ThemeToggle } from '@/components/ui/ThemeToggle.js';
import { FullscreenToggle } from '@/features/game/components/FullscreenToggle.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';

interface PhaseHeaderProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerIsJudge: boolean;
  canLeaveGame: boolean;
  onLeaveGame: () => void;
}

export function PhaseHeader({
  state,
  viewerRole,
  viewerIsJudge,
  canLeaveGame,
  onLeaveGame,
}: PhaseHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {canLeaveGame ? (
          <button
            type="button"
            onClick={onLeaveGame}
            className="text-sm font-medium text-danger hover:underline"
          >
            {GAME_MESSAGES.ui.leaveGame}
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="text-center">
        <p className="text-xs uppercase tracking-wider text-muted">
          {state.dayNumber > 0 && GAME_MESSAGES.ui.day(state.dayNumber)}
        </p>
        <h1 className="text-lg font-semibold text-fg">{GAME_MESSAGES.phase[state.phase]}</h1>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <FullscreenToggle />
        <RoleBadge role={viewerRole} isJudge={viewerIsJudge} />
      </div>
    </header>
  );
}

function RoleBadge({ role, isJudge }: { role: Role | null; isJudge: boolean }) {
  if (isJudge) {
    return <Badge tone="neutral">{GAME_MESSAGES.ui.judge}</Badge>;
  }
  if (!role) return <span />;
  const isBlack = role === 'mafia' || role === 'don';
  return <Badge tone={isBlack ? 'black' : 'red'}>{GAME_MESSAGES.role[role]}</Badge>;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'red' | 'black' | 'neutral';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-1 text-xs font-medium',
        tone === 'red' && 'bg-team-red/20 text-team-red',
        tone === 'black' && 'bg-team-black/30 text-fg',
        tone === 'neutral' && 'bg-muted/20 text-fg',
      )}
    >
      {children}
    </span>
  );
}

void TEAM;
