// Phase-specific status text and per-viewer actions, shown above the player table.
//
// The switch on `state.phase` is intentionally explicit and lives in one file:
// it is the clearest place to see what every role sees in every phase.

import { useState } from 'react';
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

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
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
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.PLAYER_INTRODUCTION}`)}.</p>
          <p className="mt-1 text-sm text-muted">{t('game.ui.introHint')}</p>
        </PanelShell>
      );

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
    case GAME_PHASE.DAY_REVOTE: {
      const currentCandidate = state.nominationSeats[state.voteRoundIdx];
      const tally = currentCandidate
        ? Object.values(state.votes).filter((c) => c === currentCandidate).length
        : 0;
      const votingClosed = state.voteRoundIdx >= state.nominationSeats.length;
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${state.phase}`)}.</p>
          {votingClosed ? (
            <p className="mt-1 text-sm text-muted">{t('game.ui.voteClosed')}</p>
          ) : currentCandidate !== undefined ? (
            <>
              <p className="mt-1 text-base font-semibold text-warning">
                {t('game.ui.voteRoundPrompt', {
                  seat: currentCandidate,
                  current: state.voteRoundIdx + 1,
                  total: state.nominationSeats.length,
                })}
              </p>
              <p className="mt-1 text-xs text-muted">
                {t('game.ui.voteRoundTally', { count: tally })}
              </p>
            </>
          ) : null}
          <p className="mt-1 text-xs text-muted">
            {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
          </p>
          {viewerIsAlive && hasVoted(state, viewerSeat) && (
            <p className="mt-1 text-sm text-success">{t('game.ui.voted')}</p>
          )}
          {viewerIsAlive &&
            !hasVoted(state, viewerSeat) &&
            !votingClosed &&
            currentCandidate !== undefined &&
            viewerSeat !== currentCandidate && (
              <p className="mt-1 text-xs text-muted">{t('game.ui.voteSpaceHint')}</p>
            )}
        </PanelShell>
      );
    }

    case GAME_PHASE.DAY_SHOOTOUT:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.DAY_SHOOTOUT}`)}.</p>
          {state.currentSpeakerSeat !== null && (
            <p className="mt-1 text-base font-semibold text-warning">
              {t('game.ui.shootoutSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.tiedSeats.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </PanelShell>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return <LiftAllVotePanel state={state} viewerIsAlive={viewerIsAlive} />;

    case GAME_PHASE.DAY_LAST_WORD:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.DAY_LAST_WORD}`)}.</p>
          {state.lastWordSeat !== null && (
            <p className="mt-1 text-base font-semibold text-warning">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
          {state.lastWordSeat !== null && viewerSeat === state.lastWordSeat && (
            <BestMoveGuessForm state={state} />
          )}
        </PanelShell>
      );

    case GAME_PHASE.NIGHT_MAFIA:
      return (
        <PanelShell>
          <p className="text-fg">{t(`game.phase.${GAME_PHASE.NIGHT_MAFIA}`)}.</p>
          {viewerIsAlive && viewerRole === ROLE.MAFIA ? (
            <p className="mt-1 text-sm text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {viewerRole === ROLE.MAFIA && state.myMafiaVote !== null && (
            <p className="mt-1 text-sm text-success">
              {t('game.ui.myMafiaVote', { seat: state.myMafiaVote })}
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

// "Lift all" yes/no ballot panel — shown during DAY_LIFT_VOTE. Big yes/no
// buttons for the viewer (if alive and hasn't voted), running tally for
// everyone. Anonymous: no per-voter breakdown leaks.
function LiftAllVotePanel({
  state,
  viewerIsAlive,
}: {
  state: GameStateProjected;
  viewerIsAlive: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<boolean | null>(null);

  async function vote(yes: boolean) {
    if (state.myLiftAllVote !== null || !viewerIsAlive || pending !== null) return;
    setPending(yes);
    try {
      await emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes });
    } finally {
      setPending(null);
    }
  }

  const hasVoted = state.myLiftAllVote !== null;
  const canVote = viewerIsAlive && !hasVoted;

  return (
    <PanelShell>
      <p className="text-fg">{t(`game.phase.${GAME_PHASE.DAY_LIFT_VOTE}`)}.</p>
      {state.tiedSeats.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">{t('game.ui.liftPrompt')}</p>

      {hasVoted && (
        <p className="mt-2 text-sm text-success">
          {state.myLiftAllVote ? t('game.ui.liftMyVoteYes') : t('game.ui.liftMyVoteNo')}
        </p>
      )}

      {canVote && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={() => vote(true)}
            disabled={pending !== null}
            className="bg-danger hover:bg-danger/90"
          >
            {t('game.ui.liftYes')}
          </Button>
          <Button onClick={() => vote(false)} disabled={pending !== null} variant="secondary">
            {t('game.ui.liftNo')}
          </Button>
        </div>
      )}

      <p className="mt-3 text-xs font-mono text-muted">
        {t('game.ui.liftTally', { yes: state.liftAllTally.yes, no: state.liftAllTally.no })}
      </p>
    </PanelShell>
  );
}

// LH (Лучший Ход) submission form for the last-word speaker.
// Shown inline in the DAY_LAST_WORD panel when the viewer is the eliminated
// player who hasn't submitted yet. They pick 1–3 alive non-self seats they
// think are mafia/don. After submission the form collapses to a confirmation.
function BestMoveGuessForm({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  const viewerId = useAuthStore((s) => s.user?.id);
  const [selected, setSelected] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!viewerId) return null;

  const alreadyGuessed = state.bestMoveGuesses.some((g) => g.byUserId === viewerId);
  if (alreadyGuessed || submitted) {
    return <p className="mt-2 text-sm text-success">{t('game.ui.lhSubmitted')}</p>;
  }

  // Candidates: alive non-self players. The eliminated speaker can't pick
  // themselves and can't pick already-dead seats — those would be rejected
  // by the engine anyway.
  const candidates = state.participants.filter(
    (p) => !p.isJudge && p.isAlive && !p.isRemoved && p.userId !== viewerId,
  );

  const toggle = (seat: number) => {
    setSelected((current) =>
      current.includes(seat)
        ? current.filter((s) => s !== seat)
        : current.length < 3
          ? [...current, seat]
          : current,
    );
  };

  const canSubmit = selected.length >= 1 && selected.length <= 3 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await emitGameAction(CLIENT_EVENT.BEST_MOVE_GUESS, { guessedSeats: selected });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold text-fg">{t('game.ui.lhTitle')}</p>
      <p className="text-xs text-muted">{t('game.ui.lhHint')}</p>
      <div className="flex flex-wrap gap-1.5">
        {candidates
          .filter((p): p is typeof p & { seat: number } => p.seat !== null)
          .map((p) => {
            const seat = p.seat;
            const picked = selected.includes(seat);
            return (
              <button
                key={seat}
                type="button"
                onClick={() => toggle(seat)}
                disabled={submitting}
                className={cn(
                  'inline-flex items-center justify-center w-9 h-9 rounded-md border text-sm font-semibold transition',
                  picked
                    ? 'border-warning bg-warning/20 text-warning'
                    : 'border-border bg-card hover:bg-bg text-fg',
                  submitting && 'opacity-60',
                )}
              >
                {seat}
              </button>
            );
          })}
      </div>
      <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {submitting ? t('common.saving') : t('game.ui.lhSubmit')}
      </Button>
    </div>
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
  viewerIsJudge: boolean;
  participantSeat: number;
  participantIsAlive: boolean;
  participantUserId: string;
}): { label: string; onClick: () => void; disabled?: boolean } | null {
  const {
    t,
    state,
    viewerRole,
    viewerUserId,
    viewerIsAlive,
    viewerIsJudge,
    participantSeat,
    participantIsAlive,
    participantUserId,
  } = args;
  // Judge is never alive in the player sense but can still issue actions —
  // skip the alive gate for them. The judge also doesn't have a seat / user
  // tile to "self-target", so the self-target guard is fine to skip.
  if (!viewerIsJudge) {
    if (!viewerIsAlive || !participantIsAlive) return null;
    if (participantUserId === viewerUserId) return null;
  } else if (!participantIsAlive) {
    return null;
  }

  switch (state.phase) {
    case GAME_PHASE.DAY_SPEECH:
      // Nomination is judge-driven. The speaker says "выставляю №X" (or
      // "выставляю себя") out loud, the judge clicks the corresponding
      // tile. Hidden from players; only shown to the judge while there's
      // an active speaker and the target isn't already nominated.
      // One nomination per speech: once the speaker has called one,
      // nominationLockedForSpeaker flips on and all nominate buttons hide
      // until the next speaker takes the floor. Self-nomination IS allowed.
      if (!viewerIsJudge) return null;
      if (state.currentSpeakerSeat === null) return null;
      if (state.farewellSeat !== null) return null;
      if (state.nominationLockedForSpeaker) return null;
      if (state.nominationSeats.includes(participantSeat)) return null;
      return {
        label: t('game.ui.nominateButton'),
        onClick: () =>
          emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      // Voting button lives in the InfoTile (and MobileStage), centered
      // with the candidate's seat number — no per-tile button so players
      // don't have to hunt across the table for it.
      return null;

    case GAME_PHASE.NIGHT_MAFIA:
      if (viewerRole !== ROLE.MAFIA && viewerRole !== ROLE.DON) return null;
      // Hide the button once THIS viewer has cast their consensus vote.
      // Other shooters' picks still propagate via pendingMafiaTargetSeat in
      // the side panel, but each shooter retains their own button until
      // they've voted themselves.
      if (state.myMafiaVote !== null) return null;
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
