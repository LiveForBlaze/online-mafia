// Seat tile with the participant's live video as the background and game metadata
// overlaid. When the player is dead, all personal information disappears and only
// a centred skull marker is shown — but the tile frame stays identical to the
// living tiles so the table layout doesn't shift.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { useTranslation } from 'react-i18next';

import { FOUL_MUTE_THRESHOLD, type GameParticipantPublic } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { restartCameraSubscription } from '@/features/game/lib/restart-video.js';

interface SeatVideoTileProps {
  participant: GameParticipantPublic;
  isSelf: boolean;
  isSpeaker: boolean;
  isNominated: boolean;
  // Мертвый, но сейчас на полу (farewell после ночного убийства / last word
  // после дневного отстрела) — отрисовываем как живого: видео, никнейм. Череп
  // появится только когда судья «Далее» сменит спикера.
  isDeadButSpeaking?: boolean;
  voteCountAgainst?: number;
  action?: { label: string; onClick: () => void; disabled?: boolean } | null;
  judgeControls?: React.ReactNode;
}

export function SeatVideoTile({
  participant,
  isSelf,
  isSpeaker,
  isNominated,
  isDeadButSpeaking = false,
  voteCountAgainst,
  action,
  judgeControls,
}: SeatVideoTileProps) {
  const { t } = useTranslation();
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
  // Камера-трек публикации физически есть и не замьючен на стороне публикатора —
  // решение об ОТОБРАЖЕНИИ берётся отдельным флагом `mayWatch`. Сам VideoTrack
  // остаётся смонтированным когда трек физически готов, чтобы не было re-init
  // задержки на каждом permission flip (см. memory: «не размонтировать
  // AudioTrack/VideoTrack на permission flip — управлять через volume/muted»).
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;
  // «Полный мертвец» — череп. Если мёртвый сейчас говорит farewell/last word,
  // показываем его как живого.
  const isDead = !participant.isAlive && !isDeadButSpeaking;

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
          {/* Видеотрек монтируется как только он физически доступен и не
              размонтируется на permission flip — мы лишь скрываем его. */}
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
            <VideoPlaceholder nickname={participant.nickname} avatarUrl={participant.avatarUrl} />
          )}

          {/* Top-left: large seat number + small secondary badges (you / vote count).
              Live players: светло-серый номер, чтобы читался с расстояния и
              не конкурировал с CTA-цветами на экране. Мёртвые: тёмно-серый
              (см. DeadOverlay). */}
          <div className="absolute top-1 left-2 flex items-center gap-2">
            <span className="text-4xl font-extrabold text-fg leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
              {participant.seat}
            </span>
            <div className="flex flex-col gap-1 text-xs">
              {isSelf && (
                <span className="rounded bg-primary/85 text-primary-fg px-1.5 py-0.5">
                  {t('game.ui.you')}
                </span>
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
                {t(`game.role.${participant.role}`)}
              </span>
            </div>
          )}

          {isSelf && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2">
              <SelfMediaButtons />
            </div>
          )}

          {/* Перезапуск чужого видеопотока — если кадр у этого игрока «завис»
              у меня на экране, я могу пере-подписаться на его камеру без
              перезагрузки страницы. На собственный seat кнопка не нужна. */}
          {!isSelf && hasCameraTrack && lkParticipant && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                restartCameraSubscription(lkParticipant);
              }}
              aria-label={t('game.ui.restartVideo')}
              title={t('game.ui.restartVideo')}
              className="absolute bottom-1 right-1 z-10 inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white opacity-60 hover:opacity-100 transition"
            >
              <RestartIcon />
            </button>
          )}

          {/* Muted players (3+ fouls) get a prominent corner badge so the judge
              can scan the table and immediately see who's lost their right to
              speak. The badge stacks on top of the role label in the top-right. */}
          {participant.foulsCount >= FOUL_MUTE_THRESHOLD && (
            <div className="absolute top-1 right-1 mt-6">
              <span className="rounded bg-danger text-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow">
                {t('game.ui.muted')}
              </span>
            </div>
          )}

          {/* Bottom strip: fouls → nickname → action. The fouls line is always rendered
              (with `invisible` when none) so the gradient height matches across tiles
              regardless of whether someone has fouls. Once they hit the mute
              threshold the count flips from yellow warning to red danger. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 space-y-1">
            <p
              className={cn(
                'text-xs',
                participant.foulsCount === 0 && 'invisible',
                participant.foulsCount >= FOUL_MUTE_THRESHOLD
                  ? 'text-danger font-semibold'
                  : 'text-warning',
              )}
            >
              {t('game.ui.foulsCount', { count: participant.foulsCount })}
            </p>
            {/* Ник во время игры — простой текст. Раньше это была ссылка
                на профиль, но клик случайно уводил со страницы посреди
                раунда; для перехода на профиль используйте game-over
                review или другую вкладку. */}
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

function RestartIcon() {
  return (
    <svg
      width="14"
      height="14"
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
  );
}

function VideoPlaceholder({ nickname, avatarUrl }: { nickname: string; avatarUrl: string | null }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card">
      <Avatar avatarUrl={avatarUrl} nickname={nickname} size={64} />
    </div>
  );
}

/**
 * Dead-seat content. Only a centred skull icon plus the seat number in the corner —
 * nickname, avatar, role, fouls all disappear. The tile frame is unchanged so the
 * table layout doesn't shift when someone is killed.
 */
function DeadOverlay({ seat, isSelf }: { seat: number | null; isSelf: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="absolute top-1 left-2 flex items-center gap-2">
        {/* Тот же размер что и у живых — но заметно темнее, чтобы «выбыл»
            считывалось с расстояния по контрасту яркости. */}
        <span className="text-4xl font-extrabold text-muted/20 leading-none">{seat}</span>
        {isSelf && (
          <span className="rounded bg-primary/85 text-primary-fg px-1.5 py-0.5 text-xs">
            {t('game.ui.you')}
          </span>
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center text-muted">
        <SkullIcon />
      </div>
    </>
  );
}

function SkullIcon() {
  const { t } = useTranslation();
  // Simple skull silhouette. Sized so it scales with its container; the parent flex
  // box keeps it centred in the tile.
  return (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      className="w-1/2 h-1/2 max-w-[64px] max-h-[64px]"
      fill="currentColor"
      aria-label={t('game.ui.playerLeftIcon')}
      role="img"
    >
      <path d="M12 2C7.03 2 3 5.94 3 10.8c0 2.34 1.02 4.5 2.7 6.1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h.6a1 1 0 0 0 1-1v-1.5h1V20a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3.1c1.68-1.6 2.7-3.76 2.7-6.1C21 5.94 16.97 2 12 2zM8.5 12.5a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zm7 0a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4zM10 16c0-.55.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1h-2c-.55 0-1-.45-1-1z" />
    </svg>
  );
}
