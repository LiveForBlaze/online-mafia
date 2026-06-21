// Judge tile placed in the player grid (slot 11 of 12).
//
// Renders the judge's live video (or initial placeholder) with a СУДЬЯ label,
// styled to fill the grid cell exactly like a SeatVideoTile so all tiles align.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { useTranslation } from 'react-i18next';

import type { GameStateProjected } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

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
  // См. SeatVideoTile: трек смонтирован постоянно, видимость классом.
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;
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
      {hasCameraTrack && lkJudge && cameraPublication && (
        <VideoTrack
          trackRef={{
            participant: lkJudge,
            source: Track.Source.Camera,
            publication: cameraPublication,
          }}
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            showCamera ? 'visible' : 'invisible',
          )}
        />
      )}
      {!showCamera && <Placeholder nickname={judge.nickname} avatarUrl={judge.avatarUrl} />}

      {/* СУДЬЯ badge in the top-left */}
      <div className="absolute top-1 left-1 flex items-center gap-1.5 text-xs">
        {/* Бейдж «СУДЬЯ» — золотой, не красный: важная роль, но это не
            «опасность». Раньше совпадал с цветом leave-кнопки и сливался. */}
        <span className="rounded bg-warning text-bg px-1.5 py-0.5 font-semibold uppercase tracking-wider">
          {t('game.ui.judge')}
        </span>
        {isSelf && (
          <span className="rounded bg-primary/85 text-primary-fg px-1.5 py-0.5">
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

      {/* Bottom strip with nickname — простой текст, без перехода на профиль:
          случайный клик во время игры не должен уводить со страницы. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-sm font-medium text-fg truncate">{judge.nickname}</p>
      </div>
    </div>
  );
}

function Placeholder({ nickname, avatarUrl }: { nickname: string; avatarUrl: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card">
      <Avatar avatarUrl={avatarUrl} nickname={nickname} size={48} />
    </div>
  );
}
