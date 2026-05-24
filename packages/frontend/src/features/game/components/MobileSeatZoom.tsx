// Fullscreen overlay for a tapped seat on mobile.
// Big video preview + nickname + role badge + action button (vote, check,
// kill, etc.) + judge per-seat controls when the viewer is the judge.
// Tap on the backdrop or the close button to dismiss.

import { useEffect } from 'react';
import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { GameParticipantPublic } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { restartCameraSubscription } from '@/features/game/lib/restart-video.js';
import { userProfilePath } from '@/routes/paths.js';

interface MobileSeatZoomProps {
  participant: GameParticipantPublic;
  voteCountAgainst?: number;
  action: { label: string; onClick: () => void; disabled?: boolean } | null;
  judgeControls?: React.ReactNode;
  onClose: () => void;
}

export function MobileSeatZoom({
  participant,
  voteCountAgainst,
  action,
  judgeControls,
  onClose,
}: MobileSeatZoomProps) {
  const { t } = useTranslation();
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex flex-col"
      onClick={onClose}
    >
      <div className="relative flex-1 flex flex-col" onClick={(event) => event.stopPropagation()}>
        {/* Close button (top-right). */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('game.ui.close')}
          className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
        >
          ✕
        </button>

        {/* Перезапустить чужой видеопоток у себя (на случай зависшего кадра). */}
        <RestartVideoButton participantUserId={participant.userId} />

        <div className="flex-1 min-h-0 relative">
          <ZoomedMedia
            participantUserId={participant.userId}
            nickname={participant.nickname}
            avatarUrl={participant.avatarUrl}
          />
          {/* Top-left badge: seat # and vote count. */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <span className="text-5xl font-extrabold text-white leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
              {participant.seat}
            </span>
            {voteCountAgainst !== undefined && voteCountAgainst > 0 && (
              <span className="rounded bg-warning/85 text-white px-2 py-1 text-sm font-semibold">
                {t('game.ui.votesCount', { count: voteCountAgainst })}
              </span>
            )}
          </div>
        </div>

        {/* Bottom action bar. */}
        <div className="flex-none bg-bg/95 border-t border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {participant.publicCode ? (
                <Link
                  to={userProfilePath(participant.publicCode)}
                  onClick={(event) => event.stopPropagation()}
                  className="block text-lg font-semibold text-fg truncate hover:underline"
                >
                  {participant.nickname}
                </Link>
              ) : (
                <p className="text-lg font-semibold text-fg truncate">{participant.nickname}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {participant.role && (
                  <span className="text-xs uppercase tracking-wider text-muted">
                    {t(`game.role.${participant.role}`)}
                  </span>
                )}
                <span
                  className={cn(
                    'text-xs',
                    participant.foulsCount > 0 ? 'text-warning' : 'text-muted',
                  )}
                >
                  {t('game.ui.foulsCount', { count: participant.foulsCount })}
                </span>
              </div>
            </div>
          </div>

          {action && (
            <Button
              onClick={() => {
                action.onClick();
                onClose();
              }}
              disabled={action.disabled}
              className="w-full"
            >
              {action.label}
            </Button>
          )}
          {judgeControls && <div className="flex flex-wrap gap-2">{judgeControls}</div>}
        </div>
      </div>
    </div>
  );
}

function ZoomedMedia({
  participantUserId,
  nickname,
  avatarUrl,
}: {
  participantUserId: string;
  nickname: string;
  avatarUrl: string | null;
}) {
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participantUserId);

  const videoPubsMap = lkParticipant
    ? (lkParticipant.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const videoPublications: TrackPublication[] = videoPubsMap
    ? Array.from(videoPubsMap.values())
    : [];
  const cameraPublication: TrackPublication | undefined = videoPublications.find(
    (pub) => pub.source === Track.Source.Camera,
  );

  const mayWatch = useShouldShowMedia(participantUserId);
  // Видеотрек смонтирован постоянно когда трек физически готов, видимость
  // переключается классом (см. SeatVideoTile).
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;

  return (
    <>
      {hasCameraTrack && lkParticipant && cameraPublication && (
        <VideoTrack
          trackRef={{
            participant: lkParticipant,
            source: Track.Source.Camera,
            publication: cameraPublication,
          }}
          className={cn(
            'absolute inset-0 w-full h-full object-cover bg-bg',
            showCamera ? 'visible' : 'invisible',
          )}
        />
      )}
      {!showCamera && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg">
          <div className="w-32 h-32 rounded-full bg-card-deep flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-semibold text-fg">{extractInitial(nickname)}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function RestartVideoButton({ participantUserId }: { participantUserId: string }) {
  const { t } = useTranslation();
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participantUserId);
  if (!lkParticipant) return null;
  return (
    <button
      type="button"
      onClick={() => restartCameraSubscription(lkParticipant)}
      aria-label={t('game.ui.restartVideo')}
      title={t('game.ui.restartVideo')}
      className="absolute top-3 right-14 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
    </button>
  );
}

function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
