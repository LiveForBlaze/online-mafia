// The right strip (landscape) / bottom strip (portrait) of the mobile
// game view. Holds phase + timer + Follow-Speaker toggle + main CTA +
// self-controls + overflow menu.

import { useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { useTranslation } from 'react-i18next';
import { Camera, CameraOff, Mic, MicOff, MoreHorizontal } from 'lucide-react';

import {
  CLIENT_EVENT,
  DAY_PHASES,
  FOUL_REMOVE_THRESHOLD,
  GAME_PHASE,
  type GameStateProjected,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';

// Должно совпадать с STEPS_WITHIN_PHASE в JudgePanel.tsx (desktop). Если
// текущая фаза имеет внутреннюю ротацию (спикер/раунд голосования/tied/
// последнее слово) — судья шлёт ADVANCE_SPEAKER (сервер сам перейдёт в
// следующую фазу, когда внутренние шаги исчерпаны). В остальных фазах —
// обычный ADVANCE_PHASE. До этого мобильная панель всегда слала SPEAKER,
// и «Далее» молчал в фазах без спикера (PLAYER_INTRODUCTION, NIGHT_*,
// MORNING_ANNOUNCEMENT).
const STEPS_WITHIN_PHASE: ReadonlyArray<string> = [
  GAME_PHASE.DAY_SPEECH,
  GAME_PHASE.DAY_VOTE,
  GAME_PHASE.DAY_REVOTE,
  GAME_PHASE.DAY_SHOOTOUT,
  GAME_PHASE.DAY_LAST_WORD,
];

interface MobileControlPanelProps {
  state: GameStateProjected;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  onOpenLog: () => void;
  onLeaveGame: () => void;
}

export function MobileControlPanel(props: MobileControlPanelProps) {
  const { state, viewerSeat, viewerIsAlive, viewerIsJudge, onOpenLog, onLeaveGame } = props;
  const { t } = useTranslation();
  const { secondsLeft, expired, warning, hasTimer } = useCountdown(
    state.phaseDeadline,
    state.phaseStartedAt,
  );
  const isFollowing = useGameStore((s) => s.isFollowingSpeaker);
  const enableFollow = useGameStore((s) => s.enableFollowSpeaker);
  const pinSeat = useGameStore((s) => s.pinSeat);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const viewer = viewerSeat !== null ? state.participants.find((p) => p.seat === viewerSeat) : null;
  const foulCount = viewer?.foulsCount ?? 0;

  const currentCandidate =
    state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE
      ? state.nominationSeats[state.voteRoundIdx]
      : undefined;
  const canCastVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    currentCandidate !== undefined &&
    viewerSeat !== currentCandidate &&
    !Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));

  const canSayOutOfTurn =
    !viewerIsJudge &&
    viewerIsAlive &&
    foulCount < FOUL_REMOVE_THRESHOLD &&
    DAY_PHASES.includes(state.phase) &&
    state.phase !== GAME_PHASE.DAY_VOTE_INTRO &&
    state.phase !== GAME_PHASE.DAY_VOTE &&
    state.phase !== GAME_PHASE.DAY_REVOTE &&
    state.phase !== GAME_PHASE.DAY_LIFT_VOTE &&
    viewerSeat !== state.currentSpeakerSeat;

  function toggleFollow() {
    if (isFollowing) {
      // Going OFF: pin whoever is currently the «active» seat — usually the
      // current speaker. If there isn't one, no-op (the toggle is mostly
      // useful during day phases anyway).
      if (state.currentSpeakerSeat !== null) pinSeat(state.currentSpeakerSeat);
    } else {
      enableFollow();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card-deep rounded-md border border-border p-2 gap-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">
          {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
        </p>
        <p className="text-sm font-semibold text-fg leading-tight">
          {t(`game.phase.${state.phase}`)}
        </p>
      </div>

      {hasTimer && (
        <p
          className={cn(
            'text-2xl font-bold tabular-nums leading-none',
            expired ? 'text-danger' : warning ? 'text-warning' : 'text-fg',
            warning && 'motion-safe:animate-pulse',
          )}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}

      <button
        type="button"
        onClick={toggleFollow}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-2xs uppercase tracking-wider transition self-start',
          isFollowing
            ? 'border-accent/60 bg-accent/15 text-accent'
            : 'border-border bg-card text-muted',
        )}
      >
        <span
          className={cn(
            'inline-block w-2 h-2 rounded-full',
            isFollowing ? 'bg-accent' : 'bg-muted',
          )}
        />
        {t('game.ui.mobile.followSpeaker')}
      </button>

      <div className="flex-1" />

      {viewerIsJudge && (
        <Button
          onClick={() =>
            STEPS_WITHIN_PHASE.includes(state.phase)
              ? emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_SPEAKER)
              : emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_PHASE)
          }
          disabled={state.status === 'finished'}
          className="w-full"
        >
          {t('game.ui.advanceStep')}
        </Button>
      )}
      {canCastVote && (
        <Button
          onClick={() =>
            currentCandidate !== undefined &&
            emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: currentCandidate })
          }
          className="w-full bg-danger hover:bg-danger/90"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}
      {state.phase === GAME_PHASE.DAY_LIFT_VOTE && !viewerIsJudge && viewerIsAlive && (
        <div className="grid grid-cols-2 gap-1">
          <Button
            onClick={() => emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes: true })}
            className="w-full bg-danger hover:bg-danger/90"
          >
            {t('game.ui.liftYes')}
          </Button>
          <Button
            onClick={() => emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes: false })}
            className="w-full"
          >
            {t('game.ui.liftNo')}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
            } catch {
              window.alert(t('game.media.micFailed'));
            }
          }}
          aria-label={t(isMicrophoneEnabled ? 'game.ui.micDisable' : 'game.ui.micEnable')}
          className={cn(
            'flex-1 h-8 rounded-md inline-flex items-center justify-center',
            isMicrophoneEnabled ? 'bg-black/60 text-white' : 'bg-danger/80 text-white',
          )}
        >
          {isMicrophoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await localParticipant.setCameraEnabled(!isCameraEnabled);
            } catch {
              window.alert(t('game.media.cameraFailed'));
            }
          }}
          aria-label={t(isCameraEnabled ? 'game.ui.cameraDisable' : 'game.ui.cameraEnable')}
          className={cn(
            'flex-1 h-8 rounded-md inline-flex items-center justify-center',
            isCameraEnabled ? 'bg-black/60 text-white' : 'bg-danger/80 text-white',
          )}
        >
          {isCameraEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setOverflowOpen((v) => !v)}
          aria-label={t('game.ui.mobile.more')}
          className="w-8 h-8 rounded-md bg-card border border-border text-fg inline-flex items-center justify-center"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {overflowOpen && (
        <div className="rounded-md border border-border bg-card p-1 flex flex-col gap-1">
          {canSayOutOfTurn && (
            <button
              type="button"
              onClick={() => {
                emitGameAction(CLIENT_EVENT.SAY_OUT_OF_TURN);
                setOverflowOpen(false);
              }}
              className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
            >
              {t('game.ui.sayOutOfTurn')}
            </button>
          )}
          {viewerIsJudge && (
            <>
              <button
                type="button"
                onClick={() => {
                  emitGameAction(CLIENT_EVENT.JUDGE_REVERT);
                  setOverflowOpen(false);
                }}
                className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
              >
                {t('game.ui.revertStep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenLog();
                  setOverflowOpen(false);
                }}
                className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
              >
                {t('game.ui.openLog')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              onLeaveGame();
              setOverflowOpen(false);
            }}
            className="text-left text-xs px-2 py-1 hover:bg-bg rounded text-danger"
          >
            {t('game.ui.leaveGame')}
          </button>
        </div>
      )}
    </div>
  );
}
