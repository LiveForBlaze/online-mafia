// Judge-only control strip. Shown above the table when the viewer is the judge.

import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, GAME_PHASE, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

interface JudgePanelProps {
  state: GameStateProjected;
}

export function JudgePanel({ state }: JudgePanelProps) {
  const { t } = useTranslation();
  // Кнопка «Дальше» нужна во всех фазах, где `applyNextSpeaker` шагает:
  //   - DAY_SPEECH — следующий спикер по ротации
  //   - DAY_VOTE / DAY_REVOTE — следующий кандидат в sequential vote
  //   - DAY_SHOOTOUT — следующий tied-спикер в перестрелке
  //   - DAY_LAST_WORD — следующая жертва в multi-victim очереди
  // Без неё судья не может пройти больше одного раунда голосования —
  // единственная альтернатива (advancePhase) резолвит весь day vote сразу.
  const showSpeakerButton =
    state.phase === GAME_PHASE.DAY_SPEECH ||
    state.phase === GAME_PHASE.DAY_VOTE ||
    state.phase === GAME_PHASE.DAY_REVOTE ||
    state.phase === GAME_PHASE.DAY_SHOOTOUT ||
    state.phase === GAME_PHASE.DAY_LAST_WORD;
  const phaseLocked = state.status === 'finished';

  return (
    <div className="rounded-md border border-border bg-card p-2 lg:p-3 flex flex-wrap items-center gap-2">
      <span className="hidden lg:inline text-xs uppercase tracking-wider text-muted mr-2">
        {t('game.ui.judgePanel')}
      </span>

      {showSpeakerButton && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_SPEAKER)}
        >
          {t('game.ui.nextSpeaker')}
        </Button>
      )}

      <Button
        size="sm"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_PHASE)}
        disabled={phaseLocked}
      >
        {t('game.ui.advancePhase')}
      </Button>
    </div>
  );
}

/** Per-seat judge controls (foul, remove). Returned by GamePage when the viewer is judge. */
export function JudgeSeatControls({ targetUserId }: { targetUserId: string }) {
  const { t } = useTranslation();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ISSUE_FOUL, { targetUserId })}
      >
        {t('game.ui.issueFoul')}
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
