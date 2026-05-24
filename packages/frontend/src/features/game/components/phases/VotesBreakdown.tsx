// «Кто за кого проголосовал» — открытая таблица голосов.
//
// По правилам сезона голосование открытое: каждый видит ровно как кто-то
// нажал «ЗА». Используется и во время самого голосования (live-tally,
// обновляется по мере того как судья проходит раунды), и в фазе
// DAY_LAST_WORD как финальное табло перед смертью отстрелянного.
//
// Группируем по кандидату, сортируем по количеству голосов убывающе. Voters
// внутри строки идут по seat-номеру, чтобы порядок не «прыгал» при каждом
// апдейте состояния.

import { useTranslation } from 'react-i18next';

import { type GameStateProjected } from '@mafia/shared';

interface VotesBreakdownProps {
  state: GameStateProjected;
  /** Размер тайла: 'desktop' — крупно с заголовком, 'mobile' — компактно одной строкой. */
  size?: 'desktop' | 'mobile';
}

export function VotesBreakdown({ state, size = 'desktop' }: VotesBreakdownProps) {
  const { t } = useTranslation();

  const groups = new Map<number, number[]>();
  for (const [voterSeat, candidateSeat] of Object.entries(state.votes)) {
    const arr = groups.get(candidateSeat) ?? [];
    arr.push(Number(voterSeat));
    groups.set(candidateSeat, arr);
  }
  if (groups.size === 0) return null;

  const rows = [...groups.entries()]
    .map(([candidate, voters]) => ({ candidate, voters: voters.sort((a, b) => a - b) }))
    .sort((a, b) => b.voters.length - a.voters.length);

  if (size === 'mobile') {
    return (
      <div className="w-full mt-1 text-[10px] font-mono text-muted">
        {rows.map(({ candidate, voters }) => (
          <p key={candidate} className="truncate">
            <span className="text-warning">№{candidate}</span>
            <span className="text-fg ml-1">({voters.length})</span>
            <span className="ml-1">{voters.map((v) => `№${v}`).join(', ')}</span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="text-xs mt-2 border-t border-border/60 pt-2">
      <p className="uppercase tracking-wider text-muted mb-1">{t('game.ui.voteTallyTitle')}</p>
      <ul className="space-y-0.5">
        {rows.map(({ candidate, voters }) => (
          <li key={candidate} className="flex items-baseline gap-2">
            <span className="font-mono text-warning w-10">№{candidate}</span>
            <span className="font-semibold text-fg w-6">{voters.length}</span>
            <span className="text-muted font-mono truncate">
              {voters.map((v) => `№${v}`).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
