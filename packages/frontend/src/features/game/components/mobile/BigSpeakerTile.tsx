// The large «active speaker» tile on mobile. Rendered by MobileGameView.
// `activeSeat` is resolved by useFollowSpeaker; this component is purely
// presentational — it does not subscribe to the store directly.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { useTranslation } from 'react-i18next';

import type { GameStateProjected } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface BigSpeakerTileProps {
  state: GameStateProjected;
  activeSeat: number | null;
  isPinned: boolean;
}

export function BigSpeakerTile({ state, activeSeat, isPinned }: BigSpeakerTileProps) {
  const participant =
    activeSeat !== null ? (state.participants.find((p) => p.seat === activeSeat) ?? null) : null;

  if (!participant) {
    return <PhasePlaceholder state={state} />;
  }

  return <BigParticipantView participant={participant} isPinned={isPinned} />;
}

function BigParticipantView({
  participant,
  isPinned,
}: {
  participant: GameStateProjected['participants'][number];
  isPinned: boolean;
}) {
  const { t } = useTranslation();
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

  return (
    <div className="relative w-full h-full min-h-0 rounded-md overflow-hidden border border-border bg-card">
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
        <div className="absolute inset-0 flex items-center justify-center bg-card-deep">
          <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={128} />
        </div>
      )}
      <span className="absolute top-2 left-3 text-3xl font-extrabold text-fg leading-none drop-shadow-lg">
        {participant.seat}
      </span>
      {isPinned && (
        <span className="absolute top-2 right-2 rounded-full bg-warning text-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider">
          {t('game.ui.mobile.pinned')}
        </span>
      )}
    </div>
  );
}

function PhasePlaceholder({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  return (
    <div className="relative w-full h-full min-h-0 rounded-md overflow-hidden border border-border bg-card-deep flex flex-col items-center justify-center gap-2 text-muted">
      <p className="text-xs uppercase tracking-wider">
        {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
      </p>
      <p className="text-lg font-semibold text-fg text-center px-4">
        {t(`game.phase.${state.phase}`)}
      </p>
    </div>
  );
}
