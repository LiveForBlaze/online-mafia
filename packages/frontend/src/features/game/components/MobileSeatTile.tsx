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
import { useTranslation } from 'react-i18next';

import { FOUL_MUTE_THRESHOLD, type GameParticipantPublic } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface MobileSeatTileProps {
  seat: number;
  participant: GameParticipantPublic | undefined;
  isSelf: boolean;
  isSpeaker: boolean;
  isNominated: boolean;
  isDeadButSpeaking?: boolean;
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
  isDeadButSpeaking = false,
  voteCountAgainst,
  action,
  onZoom,
}: MobileSeatTileProps) {
  const { t } = useTranslation();
  if (!participant) {
    return (
      <div className="rounded-md border border-dashed border-border bg-bg flex items-center justify-center text-xs text-muted min-h-0">
        №{seat}
      </div>
    );
  }

  // Череп показываем только полностью мёртвым. Если игрок только что отстрелян
  // и сейчас говорит farewell / last word — на тайле рисуем как живого.
  const isDead = !participant.isAlive && !isDeadButSpeaking;

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
        <DeadOverlay seat={seat} action={action} />
      ) : (
        <>
          <TileMedia
            participantUserId={participant.userId}
            nickname={participant.nickname}
            avatarUrl={participant.avatarUrl}
          />

          {/* Top: seat number on left — крупный светло-серый для живых, чтобы
              видеть с расстояния даже на мелком тайле. */}
          <div className="absolute top-0.5 left-1 z-10">
            <span className="text-xl font-extrabold text-fg leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
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
            {/* Ник без перехода на профиль — во время игры это только помеха. */}
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
          <Avatar avatarUrl={avatarUrl} nickname={nickname} size={40} />
        </div>
      )}
    </>
  );
}

function DeadOverlay({
  seat,
  action,
}: {
  seat: number;
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
}) {
  return (
    <>
      {/* Тот же размер и жирность что у живых — но темнее, чтоб «выбыл»
          считывалось с расстояния не по черепу, а по контрасту. */}
      <span className="absolute top-0.5 left-1 text-xl font-extrabold text-muted/20 leading-none">
        {seat}
      </span>
      <div className="absolute inset-0 flex items-center justify-center text-muted">💀</div>
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
            'absolute inset-x-0 bottom-0 block w-full text-center rounded-sm bg-accent text-accent-fg',
            'text-[10px] font-semibold uppercase tracking-wider py-0.5 z-10',
            action.disabled && 'opacity-50',
          )}
        >
          {action.label}
        </span>
      )}
    </>
  );
}
