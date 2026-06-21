// One bare-video tile in the mobile 2×5 grid. The full UI (nickname,
// foul count, vote tally, etc.) is intentionally not on the tile — those
// surface inside MiniTileActions when the user taps the tile.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';

import { FOUL_MUTE_THRESHOLD, FOUL_REMOVE_THRESHOLD } from '@mafia/shared';
import type { GameStateProjected } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { DeadSkull } from '@/features/game/components/DeadSkull.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface MiniTileProps {
  participant: GameStateProjected['participants'][number];
  isSpeaker: boolean;
  isNominated: boolean;
  voteCountAgainst: number;
  isActive: boolean;
  onTap: () => void;
}

export function MiniTile({
  participant,
  isSpeaker,
  isNominated,
  voteCountAgainst,
  isActive,
  onTap,
}: MiniTileProps) {
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participant.userId);
  const videoPubsMap = lkParticipant
    ? (lkParticipant.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const cameraPublication = videoPubsMap
    ? Array.from(videoPubsMap.values()).find((pub) => pub.source === Track.Source.Camera)
    : undefined;
  const mayWatch = useShouldShowMedia(participant.userId);
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;
  const isDead = !participant.isAlive;

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        'relative w-full aspect-square rounded-sm overflow-hidden bg-card-deep',
        isSpeaker && 'ring-1 ring-accent',
        isActive && 'ring-2 ring-warning',
        isNominated && !isSpeaker && 'ring-1 ring-warning',
        !isSpeaker && !isActive && !isNominated && 'border border-border/30',
      )}
      aria-label={`${participant.nickname} (seat ${participant.seat ?? '—'})`}
    >
      {!isDead && hasCameraTrack && lkParticipant && cameraPublication && (
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
      {!isDead && !showCamera && (
        <div className="absolute inset-0 flex items-center justify-center bg-card-deep">
          {/* Размер 32 был мизерным на тайле ~70-90px — игрок видел просто
              букву на тёмном фоне. Avatar=64 заполняет тайл нормально;
              на мини-тайлах размер не уходит за рамки сетки. */}
          <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={64} />
        </div>
      )}
      {/* Никнейм поверх нижней части тайла — без него игроки видят только
          сидень и не понимают кто это до тапа. Тонкий градиент гасит
          подложку чтобы текст читался на любом видео. */}
      {!isDead && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1 py-0.5">
          <p className="truncate text-2xs font-semibold text-fg leading-none">
            {participant.nickname}
          </p>
        </div>
      )}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center">
          <DeadSkull className="w-1/2 h-1/2 max-w-[40px] max-h-[40px]" />
        </div>
      )}
      <span className="absolute top-0.5 left-1 text-sm font-extrabold text-fg leading-none drop-shadow-md">
        {participant.seat ?? '—'}
      </span>
      {voteCountAgainst > 0 && (
        <span className="absolute top-0.5 right-1 rounded bg-warning text-bg text-2xs font-bold leading-none px-1 py-0.5">
          {voteCountAgainst}
        </span>
      )}
      {participant.foulsCount > 0 && (
        <span
          className={cn(
            'absolute bottom-0.5 left-1 rounded-full leading-none text-2xs font-bold px-1',
            participant.foulsCount >= FOUL_REMOVE_THRESHOLD
              ? 'bg-danger text-danger-fg'
              : participant.foulsCount >= FOUL_MUTE_THRESHOLD
                ? 'bg-danger/80 text-danger-fg'
                : 'bg-warning text-bg',
          )}
        >
          {participant.foulsCount}
        </span>
      )}
    </button>
  );
}
