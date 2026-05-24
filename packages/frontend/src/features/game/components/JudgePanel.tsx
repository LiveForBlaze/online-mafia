// Judge-only control strip. Shown above the table when the viewer is the judge.

import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface JudgePanelProps {
  state: GameStateProjected;
}

// Фазы, где у судьи есть «внутренний шаг» (следующий спикер / следующий
// кандидат на голосовании / следующий tied / следующая жертва last word).
// Для них «Дальше» = JUDGE_ADVANCE_SPEAKER (он сам авто-перейдёт в
// следующую фазу, когда внутренние шаги исчерпаны).
const STEPS_WITHIN_PHASE: ReadonlyArray<string> = [
  GAME_PHASE.DAY_SPEECH,
  GAME_PHASE.DAY_VOTE,
  GAME_PHASE.DAY_REVOTE,
  GAME_PHASE.DAY_SHOOTOUT,
  GAME_PHASE.DAY_LAST_WORD,
];

export function JudgePanel({ state }: JudgePanelProps) {
  const { t } = useTranslation();
  const phaseLocked = state.status === 'finished';

  // Одна кнопка «Дальше» вместо отдельных «следующий спикер» и «следующая
  // фаза». По запросу пользователя: судья двигает процесс ровно на один шаг.
  // - В фазе с внутренней ротацией (речь/голосование/перестрелка/последнее
  //   слово) — это next speaker / next round / next tied. Когда шагов
  //   больше нет, сервер сам перейдёт в следующую фазу.
  // - Вне таких фаз — обычный advance phase.
  function step() {
    if (STEPS_WITHIN_PHASE.includes(state.phase)) {
      emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_SPEAKER);
    } else {
      emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_PHASE);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-2 lg:p-3 flex flex-wrap items-center gap-2">
      <span className="hidden lg:inline text-xs uppercase tracking-wider text-muted mr-2">
        {t('game.ui.judgePanel')}
      </span>

      <Button size="sm" onClick={step} disabled={phaseLocked}>
        {t('game.ui.advanceStep')}
      </Button>
    </div>
  );
}

/** Per-seat judge controls (foul, unfoul, remove). Returned by GamePage when the viewer is judge. */
export function JudgeSeatControls({
  targetUserId,
  foulsCount,
}: {
  targetUserId: string;
  foulsCount: number;
}) {
  const { t } = useTranslation();
  // По правилу пользователя: 4 фола НЕ удаляют автоматически. Кнопка «Фол»
  // блокируется и подсвечивается красным — это сигнал ведущему: «решай
  // вручную (либо снять случайный, либо удалить)».
  const foulLocked = foulsCount >= 4;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'h-6 text-xs px-2',
          foulLocked && 'bg-danger/20 text-danger hover:bg-danger/20 cursor-not-allowed',
        )}
        disabled={foulLocked}
        title={foulLocked ? t('game.ui.foulLocked') : undefined}
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ISSUE_FOUL, { targetUserId })}
      >
        {t('game.ui.issueFoul')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        disabled={foulsCount <= 0}
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_REVOKE_FOUL, { targetUserId })}
      >
        {t('game.ui.removeFoul')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_REMOVE_PLAYER, { targetUserId })}
      >
        {t('game.ui.removePlayer')}
      </Button>
    </>
  );
}
