// Judge-only control strip. Shown above the table when the viewer is the judge.

import { CLIENT_EVENT, GAME_PHASE, type GameStateProjected } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';

const CLIENT_GAME_ADVANCE_PHASE = 'client:judge_advance_phase';
const CLIENT_GAME_ADVANCE_SPEAKER = 'client:judge_advance_speaker';

interface JudgePanelProps {
  state: GameStateProjected;
}

export function JudgePanel({ state }: JudgePanelProps) {
  const showSpeakerButton = state.phase === GAME_PHASE.DAY_SPEECH;
  const phaseLocked = state.status === 'finished';

  return (
    <div className="rounded-md border border-border bg-card p-3 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-muted mr-2">
        {GAME_MESSAGES.ui.judgePanel}
      </span>

      {showSpeakerButton && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => emitGameAction(CLIENT_GAME_ADVANCE_SPEAKER)}
        >
          {GAME_MESSAGES.ui.nextSpeaker}
        </Button>
      )}

      <Button
        size="sm"
        onClick={() => emitGameAction(CLIENT_GAME_ADVANCE_PHASE)}
        disabled={phaseLocked}
      >
        {GAME_MESSAGES.ui.advancePhase}
      </Button>
    </div>
  );
}

/** Per-seat judge controls (foul, remove). Returned by GamePage when the viewer is judge. */
export function JudgeSeatControls({ targetUserId }: { targetUserId: string }) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ISSUE_FOUL, { targetUserId })}
      >
        {GAME_MESSAGES.ui.issueFoul}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-2"
        onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_REMOVE_PLAYER, { targetUserId })}
      >
        {GAME_MESSAGES.ui.removePlayer}
      </Button>
    </>
  );
}
