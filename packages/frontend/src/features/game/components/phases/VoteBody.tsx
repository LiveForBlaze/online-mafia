// Последовательное голосование (DAY_VOTE / DAY_REVOTE).
//
// Судья объявляет очередного кандидата, игроки видят его номер и кнопку
// «ЗА» (или жмут Space). После истечения серверного таймера раунда (5с)
// кнопка пропадает, ровно как и Space-хоткей — голосовать в закрытое окно
// нельзя ни мышью, ни клавиатурой.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { useCountdown } from '@/features/game/hooks/useCountdown.js';
import { VotesBreakdown } from './VotesBreakdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface VoteBodyProps {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  size?: 'desktop' | 'mobile';
}

export function VoteBody({
  state,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
  size = 'desktop',
}: VoteBodyProps) {
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

  return size === 'mobile' ? (
    <MobileVoteBody
      state={state}
      currentCandidate={currentCandidate}
      tally={tally}
      votingClosed={votingClosed}
      canVote={canVote}
      pending={pending}
      onVote={castVote}
      viewerIsAlive={viewerIsAlive}
      hasVoted={hasVoted}
    />
  ) : (
    <DesktopVoteBody
      state={state}
      currentCandidate={currentCandidate}
      tally={tally}
      votingClosed={votingClosed}
      canVote={canVote}
      pending={pending}
      onVote={castVote}
      viewerIsAlive={viewerIsAlive}
      hasVoted={hasVoted}
    />
  );
}

interface InnerProps {
  state: GameStateProjected;
  currentCandidate: number | undefined;
  tally: number;
  votingClosed: boolean;
  canVote: boolean;
  pending: boolean;
  onVote: () => void;
  viewerIsAlive: boolean;
  hasVoted: boolean;
}

function DesktopVoteBody(p: InnerProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {!p.votingClosed && p.currentCandidate !== undefined ? (
        <>
          <p className="text-2xl sm:text-3xl font-extrabold text-warning leading-tight">
            №{p.currentCandidate}
          </p>
          <p className="text-sm text-muted">
            {t('game.ui.voteRoundPromptShort', {
              current: p.state.voteRoundIdx + 1,
              total: p.state.nominationSeats.length,
            })}
          </p>
          <p className="text-xs font-mono text-muted">
            {t('game.ui.voteRoundTally', { count: p.tally })}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted">{t('game.ui.voteClosed')}</p>
      )}

      {p.canVote && (
        <Button
          onClick={p.onVote}
          disabled={p.pending}
          className="w-full bg-danger hover:bg-danger/90 mt-2"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}

      {p.viewerIsAlive && p.hasVoted && (
        <p className="text-base text-success">{t('game.ui.voted')}</p>
      )}

      <VotesBreakdown state={p.state} />
    </div>
  );
}

function MobileVoteBody(p: InnerProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!p.votingClosed && p.currentCandidate !== undefined ? (
        <p className="text-base font-bold text-warning">
          {t('game.ui.voteRoundPrompt', {
            seat: p.currentCandidate,
            current: p.state.voteRoundIdx + 1,
            total: p.state.nominationSeats.length,
          })}
        </p>
      ) : (
        <p className="text-sm text-muted">{t('game.ui.voteClosed')}</p>
      )}
      {!p.votingClosed && p.currentCandidate !== undefined && (
        <p className="text-xs font-mono text-muted">
          {t('game.ui.voteRoundTally', { count: p.tally })}
        </p>
      )}
      {p.canVote && (
        <Button
          size="sm"
          onClick={p.onVote}
          disabled={p.pending}
          className="ml-auto bg-danger hover:bg-danger/90"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}
      {p.viewerIsAlive && p.hasVoted && (
        <p className="text-xs text-success">{t('game.ui.voted')}</p>
      )}
      <VotesBreakdown state={p.state} size="mobile" />
    </div>
  );
}
