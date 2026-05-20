// Compact mic + camera toggles for the viewer's own seat.
// Rendered inside SeatVideoTile when isSelf is true, replacing the page-level control bar.

import { useLocalParticipant } from '@livekit/components-react';

import { cn } from '@/lib/cn.js';

export function SelfMediaButtons() {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  return (
    <div className="flex gap-1">
      <IconButton
        on={isMicrophoneEnabled}
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        label={isMicrophoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
      >
        {isMicrophoneEnabled ? <MicOnIcon /> : <MicOffIcon />}
      </IconButton>
      <IconButton
        on={isCameraEnabled}
        onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        label={isCameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
      >
        {isCameraEnabled ? <CameraOnIcon /> : <CameraOffIcon />}
      </IconButton>
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
    </svg>
  );
}
