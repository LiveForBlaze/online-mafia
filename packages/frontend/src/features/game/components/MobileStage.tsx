// Compact stage strip used at the top of the game screen on mobile.
// Mirrors what InfoTile shows on desktop — phase, day, timer, speaker,
// check result — but laid out as a 2-row strip instead of a square tile.
//
// Hides the judge entirely (mobile players don't need a tile for them) and
// promotes whatever is the most important information for the current phase
// to large type (e.g. the ЧЁРНЫЙ / КРАСНЫЙ check result).

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { GameOverReview } from '@/features/game/components/GameOverReview.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { judgeStep } from '@/features/game/hooks/useJudgeStepHotkey.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface MobileStageProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

export function MobileStage({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: MobileStageProps) {
  const { t } = useTranslation();
  const { secondsLeft, expired, warning, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <section className="rounded-md border border-border bg-card-deep p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-fg leading-tight truncate">
          {t(`game.phase.${state.phase}`)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Микрофон/камера для своего стрима. На десктопе живёт на
              SeatVideoTile/JudgeTile, на мобиле тайлы маленькие и кнопок там
              нет — пользователю было неоткуда включить медиа. Поднимаем сюда
              в header стейджа: всегда видны и не зависят от того, открыт ли
              zoom своего seat. */}
          <SelfMediaButtons />
          {state.dayNumber > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {t('game.ui.day', { n: state.dayNumber })}
            </p>
          )}
          {hasTimer && (
            <p
              className={cn(
                'text-base font-bold tabular-nums leading-none',
                expired ? 'text-danger' : warning ? 'text-warning' : 'text-fg',
              )}
            >
              {formatCountdown(secondsLeft)}
            </p>
          )}
        </div>
      </div>
      <StageBody
        state={state}
        viewerRole={viewerRole}
        viewerSeat={viewerSeat}
        viewerIsAlive={viewerIsAlive}
        viewerIsJudge={viewerIsJudge}
      />
      {viewerIsJudge && <MobileJudgeStepControls state={state} />}
    </section>
  );
}

function MobileJudgeStepControls({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  const disabled = state.status === 'finished';
  return (
    <div className="flex gap-2 pt-1.5 border-t border-border/60">
      <Button
        size="sm"
        variant="ghost"
        className="px-2 text-xs"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_REVERT)}
        disabled={disabled}
        title={t('game.ui.revertHint')}
      >
        ↶
      </Button>
      <Button size="sm" className="flex-1" onClick={() => judgeStep(state)} disabled={disabled}>
        {t('game.ui.advanceStep')}
      </Button>
    </div>
  );
}

function StageBody({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: MobileStageProps) {
  const { t } = useTranslation();
  if (state.status === 'finished') {
    return <GameOverReview state={state} />;
  }

  switch (state.phase) {
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return <p className="text-sm text-muted">{t('game.ui.introHint')}</p>;

    case GAME_PHASE.ROLE_DISTRIBUTION:
      return viewerRole ? (
        <p className="text-sm text-muted">
          {t('game.ui.yourRole')}:{' '}
          <span className="text-fg font-semibold">{t(`game.role.${viewerRole}`)}</span>
        </p>
      ) : null;

    case GAME_PHASE.DAY_SPEECH: {
      const showBestMove =
        viewerSeat !== null &&
        state.farewellSeat === viewerSeat &&
        state.farewellSeat === state.currentSpeakerSeat &&
        state.dayNumber === 1;
      return (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            {state.currentSpeakerSeat !== null && (
              <p
                className={cn(
                  'text-base font-bold',
                  state.farewellSeat !== null ? 'text-warning' : 'text-fg',
                )}
              >
                {state.farewellSeat !== null
                  ? t('game.ui.farewellSpeaker', { seat: state.currentSpeakerSeat })
                  : t('game.ui.currentSpeaker', { seat: state.currentSpeakerSeat })}
              </p>
            )}
            {state.nominationSeats.length > 0 && (
              <p className="text-xs text-muted">
                {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
              </p>
            )}
          </div>
          {showBestMove && <MobileBestMoveForm state={state} viewerSeat={viewerSeat!} />}
        </div>
      );
    }

    case GAME_PHASE.DAY_VOTE_INTRO:
      return (
        <div className="space-y-1">
          <p className="text-sm font-bold text-fg">{t('game.ui.voteIntroTitle')}</p>
          <p className="text-xs text-muted">{t('game.ui.voteIntroHint')}</p>
          {state.nominationSeats.length > 0 && (
            <p className="text-sm text-warning font-mono">
              {state.nominationSeats.map((s, i) => `${i + 1}. №${s}`).join('   ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      return (
        <MobileVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_SHOOTOUT:
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          {state.currentSpeakerSeat !== null && (
            <p className="text-base font-bold text-warning">
              {t('game.ui.shootoutSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.tiedSeats.length > 0 && (
            <p className="text-xs text-muted">
              {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_LAST_WORD:
      return (
        <div className="space-y-1">
          {state.lastWordSeat !== null && (
            <p className="text-base font-bold text-warning">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
          <MobileVotesBreakdown state={state} />
        </div>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return (
        <MobileLiftVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafia = viewerRole === ROLE.MAFIA;
      return (
        <div className="space-y-0.5">
          {viewerIsAlive && isMafia ? (
            <p className="text-xs text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="text-xs text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {isMafia && state.myMafiaVote !== null && (
            <p className="text-sm font-semibold text-success">
              {t('game.ui.myMafiaVote', { seat: state.myMafiaVote })}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON: {
      // Только дону показываем результат проверки. Иначе у дона в
      // соседней фазе отображался его старый donCheck, но шерифскими
      // словами — путаница.
      if (viewerRole === ROLE.DON && state.myCheckResult) {
        const label = state.myCheckResult.result
          ? t('game.ui.donCheckSheriff')
          : t('game.ui.donCheckNotSheriff');
        const labelClass = state.myCheckResult.result ? 'text-danger' : 'text-fg';
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted">
              №{state.myCheckResult.targetSeat}
            </span>
            <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
          </div>
        );
      }
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.DON && viewerIsAlive
            ? t('game.ui.chooseDonTarget')
            : t('game.ui.waitingForOthers')}
        </p>
      );
    }

    case GAME_PHASE.NIGHT_SHERIFF: {
      if (viewerRole === ROLE.SHERIFF && state.myCheckResult) {
        const label = state.myCheckResult.result
          ? t('game.ui.sheriffCheckBlack')
          : t('game.ui.sheriffCheckRed');
        const labelClass = state.myCheckResult.result ? 'text-fg' : 'text-danger';
        return (
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wider text-muted">
              №{state.myCheckResult.targetSeat}
            </span>
            <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
          </div>
        );
      }
      return (
        <p className="text-xs text-muted">
          {viewerRole === ROLE.SHERIFF && viewerIsAlive
            ? t('game.ui.chooseSheriffTarget')
            : t('game.ui.waitingForOthers')}
        </p>
      );
    }

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <p className="text-base font-semibold text-fg">
          {state.lastNightVictimSeat !== null
            ? t('game.ui.morningVictim', { seat: state.lastNightVictimSeat })
            : t('game.ui.nobodyDied')}
        </p>
      );

    default:
      return null;
  }
}

// Compact vote panel for the mobile stage strip — same logic as InfoTile's
// VoteBody, just rendered to fit a single horizontal row with a tap target
// for the "ЗА" button.
function MobileVoteBody({
  state,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const { expired } = useCountdown(state.phaseDeadline);
  const hasVoted =
    viewerSeat !== null && Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
  const currentCandidate = state.nominationSeats[state.voteRoundIdx];
  const tally = currentCandidate
    ? Object.values(state.votes).filter((c) => c === currentCandidate).length
    : 0;
  const votingClosed = state.voteRoundIdx >= state.nominationSeats.length;
  const canVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    !hasVoted &&
    !votingClosed &&
    !expired &&
    currentCandidate !== undefined &&
    viewerSeat !== currentCandidate;

  async function castVote() {
    if (!canVote || pending || currentCandidate === undefined) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: currentCandidate });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!votingClosed && currentCandidate !== undefined ? (
        <p className="text-base font-bold text-warning">
          {t('game.ui.voteRoundPrompt', {
            seat: currentCandidate,
            current: state.voteRoundIdx + 1,
            total: state.nominationSeats.length,
          })}
        </p>
      ) : (
        <p className="text-sm text-muted">{t('game.ui.voteClosed')}</p>
      )}
      {!votingClosed && currentCandidate !== undefined && (
        <p className="text-xs font-mono text-muted">
          {t('game.ui.voteRoundTally', { count: tally })}
        </p>
      )}
      {canVote && (
        <Button
          size="sm"
          onClick={castVote}
          disabled={pending}
          className="ml-auto bg-danger hover:bg-danger/90"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}
      {viewerIsAlive && hasVoted && <p className="text-xs text-success">{t('game.ui.voted')}</p>}
      <MobileVotesBreakdown state={state} />
    </div>
  );
}

// Открытое голосование — компактная live-таблица «кто за кого» под
// кнопкой «ЗА» в мобильной полосе. Тот же контент что VotesBreakdown
// на десктопе, в более узком layout'е.
function MobileVotesBreakdown({ state }: { state: GameStateProjected }) {
  const groups = new Map<number, number[]>();
  for (const [voterSeat, candidateSeat] of Object.entries(state.votes)) {
    const arr = groups.get(candidateSeat) ?? [];
    arr.push(Number(voterSeat));
    groups.set(candidateSeat, arr);
  }
  if (groups.size === 0) return null;
  const rows = [...groups.entries()]
    .map(([c, voters]) => ({ c, voters: voters.sort((a, b) => a - b) }))
    .sort((a, b) => b.voters.length - a.voters.length);
  return (
    <div className="w-full mt-1 text-[10px] font-mono text-muted">
      {rows.map(({ c, voters }) => (
        <p key={c} className="truncate">
          <span className="text-warning">№{c}</span>
          <span className="text-fg ml-1">({voters.length})</span>
          <span className="ml-1">{voters.map((v) => `№${v}`).join(', ')}</span>
        </p>
      ))}
    </div>
  );
}

function MobileBestMoveForm({
  state,
  viewerSeat,
}: {
  state: GameStateProjected;
  viewerSeat: number;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const me = state.participants.find((p) => p.seat === viewerSeat);
  const alreadySubmitted = state.bestMoveGuesses.some((g) => g.byUserId === me?.userId);

  function togglePick(seat: number) {
    setPicked((prev) =>
      prev.includes(seat)
        ? prev.filter((s) => s !== seat)
        : prev.length < 3
          ? [...prev, seat]
          : prev,
    );
  }

  async function submit() {
    if (picked.length === 0 || picked.length > 3 || pending) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.BEST_MOVE_GUESS, { guessedSeats: picked });
    } finally {
      setPending(false);
    }
  }

  if (alreadySubmitted) {
    return <p className="text-xs text-success">{t('game.ui.lhSubmitted')}</p>;
  }

  const candidates = state.participants
    .filter((p) => !p.isJudge && p.isAlive && !p.isRemoved && p.seat !== viewerSeat)
    .map((p) => p.seat!)
    .sort((a, b) => a - b);

  return (
    <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/5 p-2">
      <p className="text-[10px] uppercase tracking-wider text-warning font-semibold">
        {t('game.ui.lhTitle')}
      </p>
      <div className="flex flex-wrap gap-1">
        {candidates.map((seat) => (
          <button
            key={seat}
            type="button"
            onClick={() => togglePick(seat)}
            className={cn(
              'h-7 min-w-7 px-2 rounded text-xs font-mono font-semibold border',
              picked.includes(seat)
                ? 'bg-warning text-bg border-warning'
                : 'bg-bg text-fg border-border',
            )}
          >
            №{seat}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        onClick={submit}
        disabled={pending || picked.length === 0}
        className="w-full"
      >
        {t('game.ui.lhSubmit')}
      </Button>
    </div>
  );
}

function MobileLiftVoteBody({
  state,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const { expired: liftExpired } = useCountdown(state.phaseDeadline);
  const canVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    viewerSeat !== null &&
    state.myLiftAllVote === null &&
    !liftExpired;

  async function vote(yes: boolean) {
    if (!canVote || pending) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-sm text-fg">
          {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
        </p>
        <p className="text-xs font-mono text-muted">
          {t('game.ui.liftTally', { yes: state.liftAllTally.yes, no: state.liftAllTally.no })}
        </p>
      </div>
      {canVote && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => vote(true)}
            disabled={pending}
            className="flex-1 bg-danger hover:bg-danger/90"
          >
            {t('game.ui.liftYes')}
          </Button>
          <Button
            size="sm"
            onClick={() => vote(false)}
            disabled={pending}
            variant="secondary"
            className="flex-1"
          >
            {t('game.ui.liftNo')}
          </Button>
        </div>
      )}
      {state.myLiftAllVote !== null && (
        <p className="text-xs text-success">
          {state.myLiftAllVote ? t('game.ui.liftMyVoteYes') : t('game.ui.liftMyVoteNo')}
        </p>
      )}
    </div>
  );
}
