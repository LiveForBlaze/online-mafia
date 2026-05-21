// Phase-specific status text and per-viewer actions, shown above the player table.
//
// The switch on `state.phase` is intentionally explicit and lives in one file:
// it is the clearest place to see what every role sees in every phase.

import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import {
  CLIENT_EVENT,
  GAME_PHASE,
  ROLE,
  type GamePhase,
  type GameStateProjected,
  type Role,
} from '@mafia/shared';

import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface PhasePanelProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
}

export function PhasePanel({ state, viewerRole, viewerSeat, viewerIsAlive }: PhasePanelProps) {
  const { t } = useTranslation();
  if (state.status === 'finished') {
    return <GameOverContent state={state} />;
  }

  switch (state.phase) {
    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.ROLE_DISTRIBUTION}`)}.</p>
          {viewerRole && (
            <p className="mt-1 text-sm text-muted">
              {t('game.ui.yourRole')}:{' '}
              <span className="text-fg font-medium">{t(`game.role.${viewerRole}`)}</span>
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.NIGHT_ZERO}`)}.</p>
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) && (
            <p className="mt-1 text-sm text-muted">{t('game.ui.teammatesHighlighted')}</p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <PanelShell>
          {state.currentSpeakerSeat !== null && (
            <p className="text-fg">
              {t('game.ui.currentSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {viewerIsAlive && viewerSeat === state.currentSpeakerSeat && (
            <p className="mt-1 text-sm text-muted">{t('game.ui.nominateHint')}</p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.DAY_VOTE:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.DAY_VOTE}`)}.</p>
          <p className="mt-1 text-sm text-muted">
            {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted(state, viewerSeat) && (
            <p className="mt-1 text-sm text-success">{t('game.ui.voted')}</p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_MAFIA:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.NIGHT_MAFIA}`)}.</p>
          {viewerIsAlive && (viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) ? (
            <p className="mt-1 text-sm text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {state.pendingMafiaTargetSeat !== null && (
            <p className="mt-1 text-sm text-danger">
              {t('game.ui.mafiaTarget', { seat: state.pendingMafiaTargetSeat })}
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckPanel
          phase={GAME_PHASE.NIGHT_DON}
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={t('game.ui.chooseDonTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckPanel
          phase={GAME_PHASE.NIGHT_SHERIFF}
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={t('game.ui.chooseSheriffTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.MORNING_ANNOUNCEMENT}`)}</p>
          <p className="mt-1 text-sm text-muted">
            {state.lastNightVictimSeat !== null
              ? t('game.ui.morningVictim', { seat: state.lastNightVictimSeat })
              : t('game.ui.nobodyDied')}
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
  phase: GamePhase;
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
}) {
  const { t } = useTranslation();
  return (
    <PanelShell>
      <p className="text-fg">{t(`game.phase.${phase}`)}.</p>
      {allowed ? (
        <p className="mt-1 text-sm text-muted">{prompt}</p>
      ) : (
        <p className="mt-1 text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
      )}
      {checkResult && (
        <p className="mt-2 text-sm font-medium">
          №{checkResult.targetSeat}:{' '}
          <span className={checkResult.result ? 'text-danger' : 'text-success'}>
            {checkResult.result ? t('game.ui.checkPositive') : t('game.ui.checkNegative')}
          </span>
        </p>
      )}
    </PanelShell>
  );
}

function GameOverContent({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  return (
    <PanelShell>
      <p className="text-lg font-semibold text-fg">{t(`game.phase.${GAME_PHASE.GAME_OVER}`)}</p>
      {state.winner && (
        <p className="mt-1 text-fg">
          {t('game.ui.winner', { team: t(`game.team.${state.winner}`).toLowerCase() })}
        </p>
      )}
    </PanelShell>
  );
}

// Helper used by GamePage to determine seat-tile actions for the viewer.
// Lives here to keep all phase-specific logic in one place. Accepts a `t`
// function so the labels stay localized — callers get it from useTranslation().
export function actionForSeatInCurrentPhase(args: {
  t: TFunction;
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
    t,
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
        label: t('game.ui.nominateButton'),
        onClick: () =>
          emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.DAY_VOTE:
      if (!state.nominationSeats.includes(participantSeat)) return null;
      if (viewerSeat !== null && hasVoted(state, viewerSeat)) return null;
      return {
        label: t('game.ui.voteFor', { seat: participantSeat }),
        onClick: () => emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_MAFIA:
      if (viewerRole !== ROLE.MAFIA && viewerRole !== ROLE.DON) return null;
      // Once the mafia has chosen a target this night, the button disappears so
      // there's no ambiguity about whether the click actually registered.
      if (state.pendingMafiaTargetSeat !== null) return null;
      return {
        label: t('game.ui.shootButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.MAFIA_TARGET, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_DON:
      if (viewerRole !== ROLE.DON) return null;
      // Hide the check button once a check has been made this night.
      if (state.myCheckResult !== null) return null;
      return {
        label: t('game.ui.checkButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.DON_CHECK, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_SHERIFF:
      if (viewerRole !== ROLE.SHERIFF) return null;
      if (state.myCheckResult !== null) return null;
      return {
        label: t('game.ui.checkButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.SHERIFF_CHECK, { targetSeat: participantSeat }),
      };

    default:
      return null;
  }
}
