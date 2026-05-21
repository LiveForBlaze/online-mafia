// Compact mic + camera toggles for the viewer's own seat.
// Rendered inside SeatVideoTile when isSelf is true, replacing the page-level control bar.

import { useLocalParticipant } from '@livekit/components-react';
import { useTranslation } from 'react-i18next';

import { CLIENT_EVENT, DAY_PHASES } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { useAuthStore } from '@/features/auth/store/auth.store.js';
import { useGameStore } from '@/features/game/store/game.store.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';

export function SelfMediaButtons() {
  const { t } = useTranslation();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  // "Сказать под фол" is visible only when it makes sense: a live non-judge
  // player during a day phase, not currently holding the floor, and not
  // already inside an active out-of-turn window themselves.
  const viewerId = useAuthStore((s) => s.user?.id);
  const state = useGameStore((s) => s.state);
  const viewer = viewerId ? state?.participants.find((p) => p.userId === viewerId) : undefined;
  const inActiveWindow = Boolean(
    state &&
    state.outOfTurnSpeaker &&
    state.outOfTurnSpeaker.userId === viewerId &&
    state.outOfTurnSpeaker.until > Date.now(),
  );
  const showFoulButton =
    !!state &&
    !!viewer &&
    !viewer.isJudge &&
    viewer.isAlive &&
    !viewer.isRemoved &&
    DAY_PHASES.includes(state.phase) &&
    viewer.seat !== state.currentSpeakerSeat &&
    !inActiveWindow;

  return (
    <div className="flex gap-1">
      <IconButton
        on={isMicrophoneEnabled}
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        label={isMicrophoneEnabled ? t('game.ui.micDisable') : t('game.ui.micEnable')}
      >
        {isMicrophoneEnabled ? <MicOnIcon /> : <MicOffIcon />}
      </IconButton>
      <IconButton
        on={isCameraEnabled}
        onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        label={isCameraEnabled ? t('game.ui.cameraDisable') : t('game.ui.cameraEnable')}
      >
        {isCameraEnabled ? <CameraOnIcon /> : <CameraOffIcon />}
      </IconButton>
      {showFoulButton && (
        <button
          type="button"
          onClick={() => emitGameAction(CLIENT_EVENT.SAY_OUT_OF_TURN)}
          aria-label={t('game.ui.sayOutOfTurn')}
          title={t('game.ui.sayOutOfTurnHint')}
          className="inline-flex items-center justify-center h-7 px-2 rounded-full bg-warning/85 hover:bg-warning text-[10px] font-semibold uppercase tracking-wider text-fg shadow"
        >
          {t('game.ui.foulShort')}
        </button>
      )}
    </div>
  );
}

interface IconButtonProps {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function IconButton({ on, onClick, label, children }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center w-7 h-7 rounded-full text-white transition-opacity',
        on ? 'bg-black/60 hover:bg-black/80' : 'bg-danger/80 hover:bg-danger',
      )}
    >
      {children}
    </button>
  );
}

function MicOnIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function CameraOnIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
    </svg>
  );
}
