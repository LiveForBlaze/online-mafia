// Судейская связка «Назад / Дальше» в InfoTile и MobileControlPanel.
//
// «Дальше» делегируется в judgeStep — он сам решает next speaker / next round /
// next phase. «Назад» откатывает последний шаг через стек снимков на сервере
// (max 10). Обе кнопки доступны во всё время кроме status==='finished'.

import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { judgeStep } from '@/features/game/hooks/useJudgeStepHotkey.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface JudgeStepControlsProps {
  state: GameStateProjected;
  size?: 'desktop' | 'mobile';
}

export function JudgeStepControls({ state, size = 'desktop' }: JudgeStepControlsProps) {
  const { t } = useTranslation();
  const disabled = state.status === 'finished';

  if (size === 'mobile') {
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
