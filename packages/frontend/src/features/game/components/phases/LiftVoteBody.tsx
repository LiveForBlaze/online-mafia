// «Подъём» (DAY_LIFT_VOTE) — голосование ДА/НЕТ за то, чтобы выгнать всех
// игроков, оставшихся после второй ничьей.
//
// Каждый живой игрок жмёт ровно один раз. По истечении окна (30 сек по
// дефолту) кнопки исчезают, судья жмёт «Дальше» — engine посчитает yes/no
// и применит ФИИМ-порог >=50% от alive.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { useCountdown } from '@/features/game/hooks/useCountdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface LiftVoteBodyProps {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  size?: 'desktop' | 'mobile';
}

export function LiftVoteBody({
  state,
  viewerSeat,
  viewerIsAlive,
  viewerIsJudge,
  size = 'desktop',
}: LiftVoteBodyProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const { expired } = useCountdown(state.phaseDeadline);

  const canVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    viewerSeat !== null &&
    state.myLiftAllVote === null &&
    !expired;

  async function vote(yes: boolean) {
    if (!canVote || pending) return;
    setPending(true);
    try {
      await emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes });
    } finally {
      setPending(false);
    }
  }

  const tied = state.tiedSeats.map((s) => `№${s}`).join(', ');
  const tally = t('game.ui.liftTally', {
    yes: state.liftAllTally.yes,
    no: state.liftAllTally.no,
  });
  const myVote =
    state.myLiftAllVote === null
      ? null
      : state.myLiftAllVote
        ? t('game.ui.liftMyVoteYes')
        : t('game.ui.liftMyVoteNo');

  if (size === 'mobile') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm text-fg">
            {t('game.ui.tiedCandidates')}: {tied}
          </p>
          <p className="text-xs font-mono text-muted">{tally}</p>
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
        {myVote && <p className="text-xs text-success">{myVote}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-fg">
        {t('game.ui.tiedCandidates')}: {tied}
      </p>
      <p className="text-xs font-mono text-muted">{tally}</p>
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
      {myVote && <p className="text-xs text-success">{myVote}</p>}
    </div>
  );
}
