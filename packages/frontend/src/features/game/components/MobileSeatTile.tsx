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
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';

import { FOUL_MUTE_THRESHOLD, type GameParticipantPublic } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { userProfilePath } from '@/routes/paths.js';

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
  const navigate = useNavigate();
  const { t } = useTranslation();
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
          <TileMedia
            participantUserId={participant.userId}
            nickname={participant.nickname}
            avatarUrl={participant.avatarUrl}
          />

          {/* Top: seat number on left, vote-count chip on right. */}
          <div className="absolute top-0.5 left-1 z-10">
            <span className="text-lg font-bold text-white leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {seat}
            </span>
          </div>
          {/* Role badge (top-right). Only present when the projection has
              revealed this role to the viewer — judge sees everyone, mafia
              sees their own team, players see their own. Critical for the
              mobile judge UI: without it the judge has no way to track
              who's mafia at a glance. */}
          {participant.role && (
            <span className="absolute top-0.5 right-1 z-10 rounded bg-black/65 text-white px-1 py-0.5 text-[10px] font-semibold leading-none">
              {t(`game.role.${participant.role}`)}
            </span>
          )}
          {voteCountAgainst !== undefined && voteCountAgainst > 0 && (
            <span className="absolute top-5 right-1 z-10 rounded bg-warning/85 text-white px-1 py-0.5 text-[10px] font-semibold">
              {voteCountAgainst}
            </span>
          )}

          {/* Foul counter / mute indicator. Yellow for warnings (1-2 fouls),
              red+bold once the player crosses into mute territory (3+). */}
          {participant.foulsCount > 0 && (
            <span
              className={cn(
                'absolute bottom-7 left-1 z-10 rounded px-1 py-0.5 text-[10px] font-bold leading-none',
                participant.foulsCount >= FOUL_MUTE_THRESHOLD
                  ? 'bg-danger text-white'
                  : 'bg-warning/85 text-white',
              )}
            >
              {participant.foulsCount >= FOUL_MUTE_THRESHOLD
                ? `${participant.foulsCount}!`
                : participant.foulsCount}
            </span>
          )}

          {/* Bottom: gradient with nickname + optional action chip. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1 z-10">
            {participant.publicCode ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(userProfilePath(participant.publicCode as string));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    navigate(userProfilePath(participant.publicCode as string));
                  }
                }}
                className="block text-[11px] font-medium text-white truncate hover:underline"
              >
                {participant.nickname}
              </span>
            ) : (
              <p className="text-[11px] font-medium text-white truncate">{participant.nickname}</p>
            )}
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
  // См. SeatVideoTile: монтируем трек когда он физически готов, видимостью
  // управляем CSS-классом — без unmount/mount на permission flip.
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
            'absolute inset-0 w-full h-full object-cover',
            showCamera ? 'visible' : 'invisible',
          )}
        />
      )}
      {!showCamera && (
        <div className="absolute inset-0 flex items-center justify-center bg-card">
          <div className="w-10 h-10 rounded-full bg-card-deep flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-fg">{extractInitial(nickname)}</span>
            )}
          </div>
        </div>
      )}
    </>
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
