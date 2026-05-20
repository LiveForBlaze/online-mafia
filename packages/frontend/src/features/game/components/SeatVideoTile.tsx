// Seat tile with the participant's live video as the background and game metadata
// overlaid. When the player is dead, all personal information disappears and only
// a centred skull marker is shown — but the tile frame stays identical to the
// living tiles so the table layout doesn't shift.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';

import type { GameParticipantPublic } from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { GAME_MESSAGES } from '@/features/game/messages.js';

interface SeatVideoTileProps {
  participant: GameParticipantPublic;
  isSelf: boolean;
  isSpeaker: boolean;
  isNominated: boolean;
  voteCountAgainst?: number;
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
  judgeControls?: React.ReactNode;
}

export function SeatVideoTile({
  participant,
  isSelf,
  isSpeaker,
  isNominated,
  voteCountAgainst,
  action,
  judgeControls,
}: SeatVideoTileProps) {
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participant.userId);

  const videoPubsMap = lkParticipant
    ? (lkParticipant.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const videoPublications: TrackPublication[] = videoPubsMap
    ? Array.from(videoPubsMap.values())
    : [];
  const cameraPublication: TrackPublication | undefined = videoPublications.find(
    (pub) => pub.source === Track.Source.Camera,
  );

  const mayWatch = useShouldShowMedia(participant.userId);
  const hasLiveCamera = Boolean(
    mayWatch && cameraPublication?.track && !cameraPublication.isMuted,
  );
  const isDead = !participant.isAlive;

  return (
    <div
      className={cn(
        // Frame is identical for living and dead seats — only the contents change.
        // Speaker/nomination outlines still apply when the seat is in play.
        'relative w-full h-full min-h-0 rounded-md overflow-hidden border bg-card',
        isSpeaker && !isDead && 'ring-2 ring-accent border-accent',
        isNominated && !isSpeaker && !isDead && 'border-warning',
        (isDead || (!isSpeaker && !isNominated)) && 'border-border',
      )}
    >
      {isDead ? (
        <DeadOverlay seat={participant.seat} isSelf={isSelf} />
      ) : (
        <>
          {hasLiveCamera && lkParticipant && cameraPublication ? (
            <VideoTrack
              trackRef={{
                participant: lkParticipant,
                source: Track.Source.Camera,
                publication: cameraPublication,
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <VideoPlaceholder nickname={participant.nickname} />
          )}

          {/* Top-left: large seat number + small secondary badges (you / vote count).
              Seat number is the primary identifier when scanning the table, so it gets
              prominent typography and a drop-shadow for legibility over any video. */}
          <div className="absolute top-1 left-2 flex items-center gap-2">
            <span className="text-3xl font-bold text-white leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {participant.seat}
            </span>
            <div className="flex flex-col gap-1 text-xs">
              {isSelf && (
                <span className="rounded bg-accent/80 text-accent-fg px-1.5 py-0.5">вы</span>
              )}
              {voteCountAgainst !== undefined && voteCountAgainst > 0 && (
                <span className="rounded bg-warning/80 text-white px-1.5 py-0.5">
                  {voteCountAgainst}
                </span>
              )}
            </div>
          </div>

          {participant.role && (
            <div className="absolute top-1 right-1">
              <span className="rounded bg-black/60 text-white px-1.5 py-0.5 text-xs">
                {GAME_MESSAGES.role[participant.role]}
              </span>
            </div>
          )}

          {isSelf && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2">
              <SelfMediaButtons />
            </div>
          )}

          {/* Bottom strip: fouls → nickname → action. The fouls line is always rendered
              (with `invisible` when none) so the gradient height matches across tiles
              regardless of whether someone has fouls. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 space-y-1">
            <p
              className={cn(
                'text-xs text-warning',
                participant.foulsCount === 0 && 'invisible',
              )}
            >
              Фолы: {participant.foulsCount}
            </p>
            <p className="text-sm font-medium text-white truncate">{participant.nickname}</p>
            {action && (
              <Button
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                className="w-full h-7 text-xs"
              >
                {action.label}
              </Button>
            )}
            {judgeControls && <div className="flex gap-1">{judgeControls}</div>}
          </div>
        </>
      )}
    </div>
  );
}

function VideoPlaceholder({ nickname }: { nickname: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center text-xl font-semibold text-fg">
        {extractInitial(nickname)}
      </div>
    </div>
  );
}

/**
 * Dead-seat content. Only a centred skull icon plus the seat number in the corner —
 * nickname, avatar, role, fouls all disappear. The tile frame is unchanged so the
 * table layout doesn't shift when someone is killed.
 */
function DeadOverlay({ seat, isSelf }: { seat: number | null; isSelf: boolean }) {
  return (
    <>
      <div className="absolute top-1 left-2 flex items-center gap-2">
        <span className="text-3xl font-bold text-fg leading-none">{seat}</span>
        {isSelf && (
          <span className="rounded bg-accent/80 text-accent-fg px-1.5 py-0.5 text-xs">вы</span>
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-muted">
        <SkullIcon />
      </div>
    </>
  );
}

function SkullIcon() {
  // Simple skull silhouette. Sized so it scales with its container; the parent flex
  // box keeps it centred in the tile.
  return (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      className="w-1/2 h-1/2 max-w-[64px] max-h-[64px]"
      fill="currentColor"
      aria-label="Игрок выбыл"
      role="img"
    >
      <path d="M12 2C7.03 2 3 5.94 3 10.8c0 2.34 1.02 4.5 2.7 6.1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h.6a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3.1c1.68-1.6 2.7-3.76 2.7-6.1C21 5.94 16.97 2 12 2zM8.5 12.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zm7 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zM10 16c0-.55.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1h-2c-.55 0-1-.45-1-1z" />
    </svg>
  );
}

function extractInitial(nickname: string): string {
  for (const ch of nickname) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
