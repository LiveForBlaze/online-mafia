// «Объявление голосования» — ведущий зачитывает выставленных, потом жмёт
// «Дальше» → начинается голосование.
//
// Спец-кейс ФИИМ: первый день + единственный кандидат — голосование не
// проводится, игрок остаётся, идём в ночь. В этом случае меняем заголовок
// и подсказку, список номинаций показываем как есть.

import { useTranslation } from 'react-i18next';

import { type GameStateProjected } from '@mafia/shared';

interface DayVoteIntroBodyProps {
  state: GameStateProjected;
  size?: 'desktop' | 'mobile';
}

export function DayVoteIntroBody({ state, size = 'desktop' }: DayVoteIntroBodyProps) {
  const { t } = useTranslation();
  const skip = state.dayNumber === 0 && state.nominationSeats.length === 1;
  const title = skip ? t('game.ui.voteSkippedTitle') : t('game.ui.voteIntroTitle');
  const hint = skip ? t('game.ui.voteSkippedHint') : t('game.ui.voteIntroHint');

  if (size === 'mobile') {
    return (
      <div className="space-y-1">
        <p className="text-sm font-bold text-fg">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
        {state.nominationSeats.length > 0 && (
          <p className="text-sm text-warning font-mono">
            {state.nominationSeats.map((s, i) => `${i + 1}. №${s}`).join('   ')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xl sm:text-2xl font-bold text-fg leading-tight">{title}</p>
      <p className="text-sm text-muted">{hint}</p>
      {state.nominationSeats.length > 0 && (
        <ol className="space-y-1 mt-1">
          {state.nominationSeats.map((seat, i) => (
            <li key={seat} className="flex items-center gap-2 text-base font-semibold text-fg">
              <span className="text-xs font-mono text-muted w-6">{i + 1}.</span>
              <span className="text-warning">№{seat}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
