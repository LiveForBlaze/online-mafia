// Compact 5×2-grid tile shown only on mobile. Way smaller than the desktop
// SeatVideoTile — it deliberately shows just enough to identify the seat
// (number + initial + nickname truncated) and exposes a tiny action chip
// at the bottom when the viewer can act on this seat.
//
// Tapping the body of the tile asks the parent to open a fullscreen overlay
// for that seat (parent owns the zoom state). The viewer's own tile is NOT
// zoomable — you don't need to look at yourself.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';

import type { GameParticipantPublic } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface MobileSeatTileProps {
  seat: number;
  participant: GameParticipantPublic | undefined;
  isSelf: boolean;
  isSpeaker: boolean;
  isNominated: boolean;
  voteCountAgainst?: number;
  action: { label: string; onClick: () => void; disabled?: boolean } | null;
  onZoom: () => void;
}

export function MobileSeatTile({
  seat,
  participant,
  isSelf,
  isSpeaker,
  isNominated,
  voteCountAgainst,
  action,
  onZoom,
}: MobileSeatTileProps) {
  if (!participant) {
    return (
      <div className="rounded-md border border-dashed border-border bg-bg flex items-center justify-center text-xs text-muted min-h-0">
        №{seat}
      </div>
    );
  }

  const isDead = !participant.isAlive;

  return (
    <button
      type="button"
      onClick={isSelf ? undefined : onZoom}
      disabled={isSelf}
      className={cn(
        'relative rounded-md overflow-hidden border bg-card text-left w-full h-full min-h-0',
        isSpeaker && !isDead && 'ring-2 ring-accent border-accent',
        isNominated && !isSpeaker && !isDead && 'border-warning',
        (isDead || (!isSpeaker && !isNominated)) && 'border-border',
        isSelf && 'ring-1 ring-accent/60',
        !isSelf && 'active:opacity-80 cursor-zoom-in',
      )}
    >
      {isDead ? (
        <DeadOverlay seat={seat} />
      ) : (
        <>
          <TileMedia participantUserId={participant.userId} nickname={participant.nickname} />

          {/* Top: seat number on left, vote-count chip on right. */}
          <div className="absolute top-0.5 left-1 z-10">
            <span className="text-lg font-bold text-white leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {seat}
            </span>
          </div>
          {voteCountAgainst !== undefined && voteCountAgainst > 0 && (
            <span className="absolute top-0.5 right-1 z-10 rounded bg-warning/85 text-white px-1 py-0.5 text-[10px] font-semibold">
              {voteCountAgainst}
            </span>
          )}

          {/* Bottom: gradient with nickname + optional action chip. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1 z-10">
            <p className="text-[11px] font-medium text-white truncate">{participant.nickname}</p>
            {action && (
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  if (!action.disabled) action.onClick();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!action.disabled) action.onClick();
                  }
                }}
                className={cn(
                  'mt-1 block w-full text-center rounded-sm bg-accent text-accent-fg',
                  'text-[10px] font-semibold uppercase tracking-wider py-0.5',
                  action.disabled && 'opacity-50',
                )}
              >
                {action.label}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  );
}

function TileMedia({
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
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card">
      <div className="w-10 h-10 rounded-full bg-card-deep flex items-center justify-center text-sm font-semibold text-fg">
        {extractInitial(nickname)}
      </div>
    </div>
  );
}

function DeadOverlay({ seat }: { seat: number }) {
  return (
    <>
      <span className="absolute top-0.5 left-1 text-lg font-bold text-fg leading-none">{seat}</span>
      <div className="absolute inset-0 flex items-center justify-center text-muted">💀</div>
    </>
  );
}

function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
