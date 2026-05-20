// Phase-specific status text and per-viewer actions, shown above the player table.
//
// The switch on `state.phase` is intentionally explicit and lives in one file:
// it is the clearest place to see what every role sees in every phase.

import { CLIENT_EVENT, GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';

interface PhasePanelProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
}

export function PhasePanel({ state, viewerRole, viewerSeat, viewerIsAlive }: PhasePanelProps) {
  if (state.status === 'finished') {
    return <GameOverContent state={state} />;
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <PanelShell>
          <p className="text-fg">{GAME_MESSAGES.phase[GAME_PHASE.ROLE_DISTRIBUTION]}.</p>
          {viewerRole && (
            <p className="mt-1 text-sm text-muted">
              {GAME_MESSAGES.ui.yourRole}:{' '}
              <span className="text-fg font-medium">{GAME_MESSAGES.role[viewerRole]}</span>
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <PanelShell>
          <p className="text-fg">{GAME_MESSAGES.phase[GAME_PHASE.NIGHT_ZERO]}.</p>
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) && (
            <p className="mt-1 text-sm text-muted">
              {GAME_MESSAGES.ui.yourTeammates} подсвечена в таблице.
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <PanelShell>
          {state.currentSpeakerSeat !== null && (
            <p className="text-fg">{GAME_MESSAGES.ui.currentSpeaker(state.currentSpeakerSeat)}</p>
          )}
          {viewerIsAlive && viewerSeat === state.currentSpeakerSeat && (
            <p className="mt-1 text-sm text-muted">
              Кликните «Выставить» на сиденье оппонента, чтобы номинировать.
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.DAY_VOTE:
      return (
        <PanelShell>
          <p className="text-fg">{GAME_MESSAGES.phase[GAME_PHASE.DAY_VOTE]}.</p>
          <p className="mt-1 text-sm text-muted">
            {GAME_MESSAGES.ui.nominations}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted(state, viewerSeat) && (
            <p className="mt-1 text-sm text-success">{GAME_MESSAGES.ui.voted}</p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_MAFIA:
      return (
        <PanelShell>
          <p className="text-fg">{GAME_MESSAGES.phase[GAME_PHASE.NIGHT_MAFIA]}.</p>
          {viewerIsAlive && (viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) ? (
            <p className="mt-1 text-sm text-muted">{GAME_MESSAGES.ui.chooseMafiaTarget}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">{GAME_MESSAGES.ui.waitingForOthers}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="mt-1 text-sm text-danger">
              {GAME_MESSAGES.ui.mafiaTarget(state.pendingMafiaTargetSeat)}
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckPanel
          phase={GAME_PHASE.NIGHT_DON}
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseDonTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckPanel
          phase={GAME_PHASE.NIGHT_SHERIFF}
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={GAME_MESSAGES.ui.chooseSheriffTarget}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <PanelShell>
          <p className="text-fg">{GAME_MESSAGES.phase[GAME_PHASE.MORNING_ANNOUNCEMENT]}</p>
          <p className="mt-1 text-sm text-muted">
            {state.lastNightVictimSeat !== null
              ? GAME_MESSAGES.ui.morningVictim(state.lastNightVictimSeat)
              : GAME_MESSAGES.ui.nobodyDied}
          </p>
        </PanelShell>
      );

    default:
      return null;
  }
}

function hasVoted(state: GameStateProjected, viewerSeat: number | null): boolean {
  if (viewerSeat === null) return false;
  return Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-border bg-card p-4">{children}</div>;
}

function NightCheckPanel({
  phase,
  allowed,
  prompt,
  checkResult,
}: {
  phase: keyof typeof GAME_MESSAGES.phase;
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
}) {
  return (
    <PanelShell>
      <p className="text-fg">{GAME_MESSAGES.phase[phase]}.</p>
      {allowed ? (
        <p className="mt-1 text-sm text-muted">{prompt}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">{GAME_MESSAGES.ui.waitingForOthers}</p>
      )}
      {checkResult && (
        <p className="mt-2 text-sm font-medium">
          №{checkResult.targetSeat}:{' '}
          <span className={checkResult.result ? 'text-danger' : 'text-success'}>
            {checkResult.result ? GAME_MESSAGES.ui.checkPositive : GAME_MESSAGES.ui.checkNegative}
          </span>
        </p>
      )}
    </PanelShell>
  );
}

function GameOverContent({ state }: { state: GameStateProjected }) {
  return (
    <PanelShell>
      <p className="text-lg font-semibold text-fg">{GAME_MESSAGES.phase[GAME_PHASE.GAME_OVER]}</p>
      {state.winner && (
        <p className="mt-1 text-fg">{GAME_MESSAGES.ui.winner(GAME_MESSAGES.team[state.winner])}</p>
      )}
    </PanelShell>
  );
}

// Helper used by GamePage to determine seat-tile actions for the viewer.
// Lives here to keep all phase-specific logic in one place.
export function actionForSeatInCurrentPhase(args: {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerUserId: string;
  viewerIsAlive: boolean;
  participantSeat: number;
  participantIsAlive: boolean;
  participantUserId: string;
}): { label: string; onClick: () => void; disabled?: boolean } | null {
  const {
    state,
    viewerRole,
    viewerSeat,
    viewerUserId,
    viewerIsAlive,
    participantSeat,
    participantIsAlive,
    participantUserId,
  } = args;
  if (!viewerIsAlive || !participantIsAlive) return null;
  if (participantUserId === viewerUserId) return null;

  switch (state.phase) {
    case GAME_PHASE.DAY_SPEECH:
      if (viewerSeat !== state.currentSpeakerSeat) return null;
      if (state.nominationSeats.includes(participantSeat)) return null;
      return {
        label: GAME_MESSAGES.ui.nominateButton,
        onClick: () =>
          emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.DAY_VOTE:
      if (!state.nominationSeats.includes(participantSeat)) return null;
      if (viewerSeat !== null && hasVoted(state, viewerSeat)) return null;
      return {
        label: GAME_MESSAGES.ui.voteFor(participantSeat),
        onClick: () => emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_MAFIA:
      if (viewerRole !== ROLE.MAFIA && viewerRole !== ROLE.DON) return null;
      return {
        label: 'Стрелять',
        onClick: () => emitGameAction(CLIENT_EVENT.MAFIA_TARGET, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_DON:
      if (viewerRole !== ROLE.DON) return null;
      return {
        label: 'Проверить',
        onClick: () => emitGameAction(CLIENT_EVENT.DON_CHECK, { targetSeat: participantSeat }),
        disabled: state.myCheckResult !== null,
      };

    case GAME_PHASE.NIGHT_SHERIFF:
      if (viewerRole !== ROLE.SHERIFF) return null;
      return {
        label: 'Проверить',
        onClick: () => emitGameAction(CLIENT_EVENT.SHERIFF_CHECK, { targetSeat: participantSeat }),
        disabled: state.myCheckResult !== null,
      };

    default:
      return null;
  }
}
