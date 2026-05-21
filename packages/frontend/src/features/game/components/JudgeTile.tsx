// Judge tile placed in the player grid (slot 11 of 12).
//
// Renders the judge's live video (or initial placeholder) with a СУДЬЯ label,
// styled to fill the grid cell exactly like a SeatVideoTile so all tiles align.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { GameStateProjected } from '@mafia/shared';

import { cn } from '@/lib/cn.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { userProfilePath } from '@/routes/paths.js';

interface JudgeTileProps {
  state: GameStateProjected;
  viewerUserId: string;
}

export function JudgeTile({ state, viewerUserId }: JudgeTileProps) {
  const { t } = useTranslation();
  const judge = state.participants.find((p) => p.isJudge);
  const liveKitParticipants = useParticipants();
  const lkJudge = judge ? liveKitParticipants.find((p) => p.identity === judge.userId) : undefined;

  const mayWatch = useShouldShowMedia(judge?.userId ?? '');

  if (!judge) {
    return (
      <div className="w-full h-full min-h-0 rounded-md border border-dashed border-border bg-bg flex items-center justify-center text-sm text-muted">
        {t('game.ui.judgeNone')}
      </div>
    );
  }

  const videoPubsMap = lkJudge
    ? (lkJudge.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const cameraPublication = videoPubsMap
    ? Array.from(videoPubsMap.values()).find((pub) => pub.source === Track.Source.Camera)
    : undefined;
  const hasLiveCamera = Boolean(mayWatch && cameraPublication?.track && !cameraPublication.isMuted);
  const isSelf = judge.userId === viewerUserId;

  return (
    <div
      className={cn(
        // Darker neutral background (card-deep) sets the judge apart from the 10
        // video tiles. Same surface as InfoTile so the two centre cells read as one
        // "control zone".
        'relative w-full h-full min-h-0 rounded-md overflow-hidden border border-border bg-card-deep',
      )}
    >
      {hasLiveCamera && lkJudge && cameraPublication ? (
        <VideoTrack
          trackRef={{
            participant: lkJudge,
            source: Track.Source.Camera,
            publication: cameraPublication,
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Placeholder nickname={judge.nickname} />
      )}

      {/* СУДЬЯ badge in the top-left */}
      <div className="absolute top-1 left-1 flex items-center gap-1.5 text-xs">
        <span className="rounded bg-accent text-accent-fg px-1.5 py-0.5 font-semibold uppercase tracking-wider">
          {t('game.ui.judge')}
        </span>
        {isSelf && (
          <span className="rounded bg-accent/80 text-accent-fg px-1.5 py-0.5">
            {t('game.ui.you')}
          </span>
        )}
      </div>

      {/* Mic / camera controls — same placement as on a player's seat tile so
          the judge doesn't have to hunt for them in the page header. */}
      {isSelf && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2">
          <SelfMediaButtons />
        </div>
      )}

      {/* Bottom strip with nickname */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        {judge.publicCode ? (
          <Link
            to={userProfilePath(judge.publicCode)}
            onClick={(event) => event.stopPropagation()}
            className="block text-sm font-medium text-white truncate hover:underline"
          >
            {judge.nickname}
          </Link>
        ) : (
          <p className="text-sm font-medium text-white truncate">{judge.nickname}</p>
        )}
      </div>
    </div>
  );
}

function Placeholder({ nickname }: { nickname: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card">
      <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center text-lg font-semibold text-fg">
        {firstLetter(nickname)}
      </div>
    </div>
  );
}

function firstLetter(s: string): string {
  for (const ch of s) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return '?';
}
