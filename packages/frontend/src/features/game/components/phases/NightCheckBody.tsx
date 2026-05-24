// Тело ночной проверки (дон / шериф).
//
// До клика — подсказка «выберите цель» только тому, кто играет эту роль.
// После клика — крупный результат («ШЕРИФ» / «ЧЁРНЫЙ» / «КРАСНЫЙ»). Окно
// результата рендерим только тому viewer'у, чья проверка — иначе мёртвый
// шериф/дон видел бы чужой результат с неправильной формулировкой.

import { useTranslation } from 'react-i18next';

import { type GameStateProjected } from '@mafia/shared';

import { cn } from '@/lib/cn.js';

interface NightCheckBodyProps {
  kind: 'sheriff' | 'don';
  allowed: boolean;
  prompt: string;
  checkResult: GameStateProjected['myCheckResult'];
  size?: 'desktop' | 'mobile';
}

export function NightCheckBody({
  kind,
  allowed,
  prompt,
  checkResult,
  size = 'desktop',
}: NightCheckBodyProps) {
  const { t } = useTranslation();

  if (checkResult) {
    // Шериф и дон по разному называют результат:
    //   sheriff:  result=true  → цель играет за чёрных
    //   don:      result=true  → цель == шериф
    let label: string;
    let labelClass: string;
    if (kind === 'sheriff') {
      label = checkResult.result ? t('game.ui.sheriffCheckBlack') : t('game.ui.sheriffCheckRed');
      labelClass = checkResult.result ? 'text-fg' : 'text-danger';
    } else {
      label = checkResult.result ? t('game.ui.donCheckSheriff') : t('game.ui.donCheckNotSheriff');
      labelClass = checkResult.result ? 'text-danger' : 'text-fg';
    }
    if (size === 'mobile') {
      return (
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wider text-muted">
            №{checkResult.targetSeat}
          </span>
          <span className={cn('text-2xl font-extrabold leading-tight', labelClass)}>{label}</span>
        </div>
      );
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

  const text = allowed ? prompt : t('game.ui.waitingForOthers');
  return size === 'mobile' ? (
    <p className="text-xs text-muted">{text}</p>
  ) : (
    <div className="text-xs">
      <p className="text-muted">{text}</p>
    </div>
  );
}
