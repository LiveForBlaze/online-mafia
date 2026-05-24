// Info tile — 12th cell of the grid, opposite the judge.
//
// Shows the current phase, day number, and phase-specific context (current speaker,
// nominations, vote progress, check results). Personal prompts (your check result)
// are still surfaced here for the relevant viewer.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { GameOverReview } from '@/features/game/components/GameOverReview.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { judgeStep } from '@/features/game/hooks/useJudgeStepHotkey.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface InfoTileProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}

export function InfoTile({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: InfoTileProps) {
  return (
    // Same dark surface as the JudgeTile so the two centre cells form a unified
    // "control zone" clearly distinct from the surrounding video tiles.
    <div className="relative w-full h-full min-h-0 rounded-md border border-border bg-card-deep p-3 overflow-auto flex flex-col gap-2">
      <InfoGlyph />
      <Header state={state} />
      <Body
        state={state}
        viewerRole={viewerRole}
        viewerSeat={viewerSeat}
        viewerIsAlive={viewerIsAlive}
        viewerIsJudge={viewerIsJudge}
      />
      {viewerIsJudge && <JudgeStepControls state={state} />}
    </div>
  );
}

// Кнопки управления судьи внутри InfoTile (там же, где у игроков «ЗА»).
// «Дальше» дублируется хоткеем Space (см. useJudgeStepHotkey).
function JudgeStepControls({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  const disabled = state.status === 'finished';
  return (
    <div className="mt-auto pt-2 flex gap-2 border-t border-border/60">
      <Button
        size="sm"
        variant="ghost"
        className="px-2 text-xs"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_REVERT)}
        disabled={disabled}
        title={t('game.ui.revertHint')}
      >
        ↶ {t('game.ui.revert')}
      </Button>
      <Button size="sm" className="flex-1" onClick={() => judgeStep(state)} disabled={disabled}>
        {t('game.ui.advanceStep')}
      </Button>
    </div>
  );
}

function InfoGlyph() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted/20 text-muted text-xs font-semibold"
    >
      i
    </span>
  );
}

function Header({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  const { secondsLeft, expired, hasTimer } = useCountdown(state.phaseDeadline);

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted">
        {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
      </p>
      <p className="text-base sm:text-lg font-semibold text-fg leading-tight">
        {t(`game.phase.${state.phase}`)}
      </p>
      {hasTimer && (
        <p
          className={cn(
            'mt-2 text-3xl sm:text-4xl font-bold tabular-nums leading-none',
            expired ? 'text-danger' : 'text-fg',
          )}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}
    </div>
  );
}

function Body({
  state,
  viewerRole,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
}: {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
}) {
  const { t } = useTranslation();
  if (state.status === 'finished') {
    return <GameOverReview state={state} />;
  }

  switch (state.phase) {
    case GAME_PHASE.PLAYER_INTRODUCTION:
      return <p className="text-sm text-muted">{t('game.ui.introHint')}</p>;

    case GAME_PHASE.ROLE_DISTRIBUTION:
      return (
        <div className="text-sm text-muted">
          {viewerRole && (
            <>
              {t('game.ui.yourRole')}:{' '}
              <span className="text-fg text-base font-semibold">
                {t(`game.role.${viewerRole}`)}
              </span>
            </>
          )}
        </div>
      );

    case GAME_PHASE.NIGHT_ZERO:
      return (
        <div className="text-sm text-muted">
          {(viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) &&
            t('game.ui.mafiaTeamHighlight')}
        </div>
      );

    case GAME_PHASE.DAY_SPEECH:
      return (
        <div className="space-y-2">
          {state.currentSpeakerSeat !== null && (
            <p
              className={cn(
                'text-xl sm:text-2xl font-bold leading-tight',
                state.farewellSeat !== null ? 'text-warning' : 'text-fg',
              )}
            >
              {state.farewellSeat !== null
                ? t('game.ui.farewellSpeaker', { seat: state.currentSpeakerSeat })
                : t('game.ui.currentSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.nominationSeats.length > 0 && (
            <p className="text-sm text-muted">
              {t('game.ui.nominations')}: {state.nominationSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
          {/* ФИИМ: жертва первой ночи (farewellSeat == currentSpeakerSeat,
              dayNumber===1) во время своей прощальной минуты называет ЛХ. */}
          {viewerSeat !== null &&
            state.farewellSeat === viewerSeat &&
            state.farewellSeat === state.currentSpeakerSeat &&
            state.dayNumber === 1 && <BestMoveForm state={state} viewerSeat={viewerSeat} />}
        </div>
      );

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      return (
        <VoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_SHOOTOUT:
      return (
        <div className="space-y-2">
          {state.currentSpeakerSeat !== null && (
            <p className="text-xl sm:text-2xl font-bold text-warning leading-tight">
              {t('game.ui.shootoutSpeaker', { seat: state.currentSpeakerSeat })}
            </p>
          )}
          {state.tiedSeats.length > 0 && (
            <p className="text-sm text-muted">
              {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
            </p>
          )}
        </div>
      );

    case GAME_PHASE.DAY_LIFT_VOTE:
      return (
        <LiftVoteBody
          state={state}
          viewerSeat={viewerSeat}
          viewerIsAlive={viewerIsAlive}
          viewerIsJudge={viewerIsJudge}
        />
      );

    case GAME_PHASE.DAY_LAST_WORD: {
      // Post-vote tally so the judge (and everyone else) sees the full
      // breakdown of who got how many "ЗА" votes, in addition to the
      // eliminated speaker.
      const tally = new Map<number, number>();
      for (const candidate of Object.values(state.votes)) {
        tally.set(candidate, (tally.get(candidate) ?? 0) + 1);
      }
      const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      return (
        <div className="space-y-2">
          {state.lastWordSeat !== null && (
            <p className="text-xl sm:text-2xl font-extrabold text-warning leading-tight">
              {t('game.ui.lastWordSpeaker', { seat: state.lastWordSeat })}
            </p>
          )}
          {sorted.length > 0 && (
            <div className="text-xs">
              <p className="uppercase tracking-wider text-muted mb-1">
                {t('game.ui.voteTallyTitle')}
              </p>
              <ul className="space-y-0.5">
                {sorted.map(([seat, count]) => (
                  <li key={seat} className="flex items-center gap-2">
                    <span className="font-mono text-muted w-6">№{seat}</span>
                    <span className="font-semibold text-fg">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_MAFIA: {
      const isMafia = viewerRole === ROLE.MAFIA;
      return (
        <div className="space-y-2">
          {viewerIsAlive && isMafia ? (
            <p className="text-sm text-muted">{t('game.ui.chooseMafiaTarget')}</p>
          ) : (
            <p className="text-sm text-muted">{t('game.ui.waitingForOthers')}</p>
          )}
          {isMafia && state.myMafiaVote !== null && (
            <p className="text-base font-semibold text-success">
              {t('game.ui.myMafiaVote', { seat: state.myMafiaVote })}
            </p>
          )}
        </div>
      );
    }

    case GAME_PHASE.NIGHT_DON:
      return (
        <NightCheckBody
          kind="don"
          allowed={viewerRole === ROLE.DON && viewerIsAlive}
          prompt={t('game.ui.chooseDonTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.NIGHT_SHERIFF:
      return (
        <NightCheckBody
          kind="sheriff"
          allowed={viewerRole === ROLE.SHERIFF && viewerIsAlive}
          prompt={t('game.ui.chooseSheriffTarget')}
          checkResult={state.myCheckResult}
        />
      );

    case GAME_PHASE.MORNING_ANNOUNCEMENT:
      return (
        <div className="text-lg sm:text-xl font-semibold text-fg leading-tight">
          {state.lastNightVictimSeat !== null
            ? t('game.ui.morningVictim', { seat: state.lastNightVictimSeat })
            : t('game.ui.nobodyDied')}
        </div>
      );

    default:
      return null;
  }
}

function NightCheckBody({
  kind,
  allowed,
  prompt,
  checkResult,
}: {
  kind: 'sheriff' | 'don';
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
}) {
  const { t } = useTranslation();
  // Once a check has been made, the result is THE thing the player needs to
  // read — make it the dominant element of the tile so it's legible from
  // across the table. The prompt fades to a small caption.
  if (checkResult) {
    // Sheriff and don have different semantics:
    //   sheriff: result=true → target plays for the black team
    //   don:     result=true → target IS the sheriff (red team)
    // Colour the label by the team it names — red word in red, black word
    // in bold white-on-bg — so the meaning reads even when squinted at.
    let label: string;
    let labelClass: string;
    if (kind === 'sheriff') {
      label = checkResult.result ? t('game.ui.sheriffCheckBlack') : t('game.ui.sheriffCheckRed');
      labelClass = checkResult.result ? 'text-fg' : 'text-danger';
    } else {
      label = checkResult.result ? t('game.ui.donCheckSheriff') : t('game.ui.donCheckNotSheriff');
      labelClass = checkResult.result ? 'text-danger' : 'text-fg';
    }
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs uppercase tracking-wider text-muted">№{checkResult.targetSeat}</p>
        <p
          className={cn(
            'text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight',
            labelClass,
          )}
        >
          {label}
        </p>
      </div>
    );
  }
  return (
    <div className="text-xs">
      <p className="text-muted">{allowed ? prompt : t('game.ui.waitingForOthers')}</p>
    </div>
  );
}

// Sequential-vote body for the info tile: candidate number, tally, and a big
// "ЗА" button right under it so the voter doesn't have to scan the table to
// find where to click. The button is also bound to Space via useVoteHotkey,
// but most players will reach for the mouse first.
function VoteBody({
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
    <div className="space-y-2">
      {!votingClosed && currentCandidate !== undefined ? (
        <>
          <p className="text-2xl sm:text-3xl font-extrabold text-warning leading-tight">
            №{currentCandidate}
          </p>
          <p className="text-sm text-muted">
            {t('game.ui.voteRoundPromptShort', {
              current: state.voteRoundIdx + 1,
              total: state.nominationSeats.length,
            })}
          </p>
          <p className="text-xs font-mono text-muted">
            {t('game.ui.voteRoundTally', { count: tally })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t('game.ui.voteClosed')}</p>
      )}

      {canVote && (
        <Button
          onClick={castVote}
          disabled={pending}
          className="w-full bg-danger hover:bg-danger/90 mt-2"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}

      {viewerIsAlive && hasVoted && <p className="text-base text-success">{t('game.ui.voted')}</p>}
    </div>
  );
}

// ФИИМ: жертва первой ночи на утренней прощальной минуте называет 1–3 номера
// «лучшего хода». Форма открывается только этому игроку.
function BestMoveForm({ state, viewerSeat }: { state: GameStateProjected; viewerSeat: number }) {
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
    return <p className="text-sm text-success mt-2">{t('game.ui.lhSubmitted')}</p>;
  }

  const candidates = state.participants
    .filter((p) => !p.isJudge && p.isAlive && !p.isRemoved && p.seat !== viewerSeat)
    .map((p) => p.seat!)
    .sort((a, b) => a - b);

  return (
    <div className="mt-3 space-y-2 rounded-md border border-warning/40 bg-warning/5 p-2">
      <p className="text-xs uppercase tracking-wider text-warning font-semibold">
        {t('game.ui.lhTitle')}
      </p>
      <p className="text-xs text-muted">{t('game.ui.lhHint')}</p>
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

// ФИИМ: голосование за подъём — каждый живой нажимает ДА/НЕТ, ровно один раз.
function LiftVoteBody({
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
  const canVote =
    !viewerIsJudge && viewerIsAlive && viewerSeat !== null && state.myLiftAllVote === null;

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
    <div className="space-y-2">
      <p className="text-sm text-fg">
        {t('game.ui.tiedCandidates')}: {state.tiedSeats.map((s) => `№${s}`).join(', ')}
      </p>
      <p className="text-xs font-mono text-muted">
        {t('game.ui.liftTally', { yes: state.liftAllTally.yes, no: state.liftAllTally.no })}
      </p>
      {canVote && (
        <div className="flex gap-2 mt-2">
          <Button
            onClick={() => vote(true)}
            disabled={pending}
            className="flex-1 bg-danger hover:bg-danger/90"
          >
            {t('game.ui.liftYes')}
          </Button>
          <Button
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
