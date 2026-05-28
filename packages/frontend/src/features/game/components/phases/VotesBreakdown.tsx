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

import { cn } from '@/lib/cn.js';

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
      <div className="w-full mt-1 text-xs font-mono">
        {rows.map(({ candidate, voters }) => (
          <p key={candidate} className="truncate leading-snug">
            <span className="text-warning font-bold">№{candidate}</span>
            <span className="text-fg ml-1 font-bold">({voters.length})</span>
            <span className="ml-1 text-muted">{voters.map((v) => `№${v}`).join(', ')}</span>
          </p>
        ))}
      </div>
    );
  }

  // Десктоп: крупнее шрифт + двух-колоночная сетка для длинных бюллетеней
  // (если кандидатов 3+, чтобы не убегали под скролл). По жалобе пользователя
  // «голоса мелким шрифтом, иногда не видно».
  return (
    <div className="text-sm mt-2 border-t border-border/60 pt-2">
      <p className="uppercase tracking-wider text-muted mb-1 text-xs">
        {t('game.ui.voteTallyTitle')}
      </p>
      <ul
        className={cn(
          'gap-x-4',
          rows.length >= 3 ? 'grid grid-cols-1 sm:grid-cols-2 gap-y-0.5' : 'space-y-0.5',
        )}
      >
        {rows.map(({ candidate, voters }) => (
          <li key={candidate} className="flex items-baseline gap-2">
            <span className="font-mono font-bold text-warning w-10">№{candidate}</span>
            <span className="font-bold text-fg w-6">{voters.length}</span>
            <span className="text-fg/85 font-mono truncate">
              {voters.map((v) => `№${v}`).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
