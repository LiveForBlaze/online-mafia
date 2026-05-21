// Fullscreen overlay for a tapped seat on mobile.
// Big video preview + nickname + role badge + action button (vote, check,
// kill, etc.) + judge per-seat controls when the viewer is the judge.
// Tap on the backdrop or the close button to dismiss.

import { useEffect } from 'react';
import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { useTranslation } from 'react-i18next';

import type { GameParticipantPublic } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

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

        <div className="flex-1 min-h-0 relative">
          <ZoomedMedia participantUserId={participant.userId} nickname={participant.nickname} />
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
              <p className="text-lg font-semibold text-fg truncate">{participant.nickname}</p>
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
}: {
  participantUserId: string;
  nickname: string;
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
  const hasLiveCamera = Boolean(mayWatch && cameraPublication?.track && !cameraPublication.isMuted);

  if (hasLiveCamera && lkParticipant && cameraPublication) {
    return (
      <VideoTrack
        trackRef={{
          participant: lkParticipant,
          source: Track.Source.Camera,
          publication: cameraPublication,
        }}
        className="absolute inset-0 w-full h-full object-cover bg-bg"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-bg">
      <div className="w-32 h-32 rounded-full bg-card-deep flex items-center justify-center text-5xl font-semibold text-fg">
        {extractInitial(nickname)}
      </div>
    </div>
  );
}

function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
