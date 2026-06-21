// Seat tile with the participant's live video as the background and game metadata
// overlaid. When the player is dead, all personal information disappears and only
// a centred skull marker is shown — but the tile frame stays identical to the
// living tiles so the table layout doesn't shift.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { FOUL_MUTE_THRESHOLD, ROLE_TO_TEAM, TEAM, type GameParticipantPublic } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { DeadSkull } from '@/features/game/components/DeadSkull.js';
import { SelfMediaButtons } from '@/features/game/components/SelfMediaButtons.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';
import { restartCameraSubscription } from '@/features/game/lib/restart-video.js';

interface SeatVideoTileProps {
  participant: GameParticipantPublic;
  isSelf: boolean;
  isSpeaker: boolean;
  isNominated: boolean;
  // True when this is the viewer's own seat AND it's their turn to act (they
  // hold the floor). Drives a non-colour "ВАШ ХОД" cue on the tile.
  isYourTurn?: boolean;
  // Мертвый, но сейчас на полу (farewell после ночного убийства / last word
  // после дневного отстрела) — отрисовываем как живого: видео, никнейм. Череп
  // появится только когда судья «Далее» сменит спикера.
  isDeadButSpeaking?: boolean;
  voteCountAgainst?: number;
  action?: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean } | null;
  judgeControls?: React.ReactNode;
}

export function SeatVideoTile({
  participant,
  isSelf,
  isSpeaker,
  isNominated,
  isYourTurn = false,
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
        // Your-turn cue: a bright primary ring + pulse (motion-safe) so the
        // viewer can't miss that the floor is theirs. Non-colour reinforcement
        // (the "ВАШ ХОД" badge below) carries the same signal for colourblind.
        isYourTurn && !isDead && 'ring-2 ring-primary motion-safe:animate-pulse',
      )}
    >
      {isDead ? (
        <DeadOverlay seat={participant.seat} isSelf={isSelf} action={action} />
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
            <span className="text-4xl font-extrabold text-fg leading-none drop-shadow-lg">
              {participant.seat}
            </span>
            <div className="flex flex-col gap-1 text-xs">
              {isSelf && (
                <span className="rounded bg-primary text-primary-fg px-1.5 py-0.5">
                  {t('game.ui.you')}
                </span>
              )}
              {/* Vote count: dark text on solid amber (matches JudgeTile pattern)
                  — white on light amber failed contrast. */}
              {voteCountAgainst !== undefined && voteCountAgainst > 0 && (
                <span
                  className="rounded bg-warning text-bg px-1.5 py-0.5 font-semibold"
                  title={t('game.ui.voteRoundTally', { count: voteCountAgainst })}
                >
                  {voteCountAgainst}
                </span>
              )}
            </div>
          </div>

          {/* "ВАШ ХОД" cue — non-colour reinforcement of the pulsing ring. */}
          {isYourTurn && (
            <div className="absolute bottom-9 left-1/2 -translate-x-1/2 z-10">
              <span className="rounded bg-primary text-primary-fg px-2 py-0.5 text-2xs font-bold uppercase tracking-wider shadow">
                {t('game.ui.yourTurn')}
              </span>
            </div>
          )}

          {/* Speaker vs nominated — distinguished by glyph/badge, not just the
              outline colour (mic for the floor-holder, NOM for nominees).
              Placed below the self media-button row so they never overlap. */}
          {isSpeaker && (
            <div
              className={cn('absolute left-1/2 -translate-x-1/2 z-10', isSelf ? 'top-9' : 'top-1')}
            >
              <span
                className="inline-flex items-center justify-center rounded-full bg-accent/90 text-accent-fg p-1 shadow"
                aria-label={t('game.ui.speaking')}
                title={t('game.ui.speaking')}
              >
                <Mic size={12} strokeWidth={2.5} aria-hidden="true" />
              </span>
            </div>
          )}
          {isNominated && !isSpeaker && (
            <div
              className={cn('absolute left-1/2 -translate-x-1/2 z-10', isSelf ? 'top-9' : 'top-1')}
            >
              <span className="rounded bg-warning text-bg px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider shadow">
                {t('game.ui.nominatedShort')}
              </span>
            </div>
          )}

          {participant.role && (
            <div className="absolute top-1 right-1">
              {/* Role badge respects team semantics (red vs black) instead of a
                  neutral black chip, so a revealed role reads as its team. */}
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-semibold',
                  ROLE_TO_TEAM[participant.role] === TEAM.BLACK
                    ? 'bg-team-black/70 text-fg'
                    : 'bg-team-red/30 text-danger-text',
                )}
              >
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
              <span className="rounded bg-danger text-danger-fg px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider shadow">
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
            <p className="text-sm font-medium text-fg truncate">{participant.nickname}</p>
            {action && (
              <Button
                size="sm"
                variant={action.destructive ? 'danger' : 'primary'}
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
 * Dead-seat content. Centred skull icon plus the seat number in the corner —
 * nickname, avatar, role, fouls all disappear. The tile frame is unchanged so the
 * table layout doesn't shift when someone is killed.
 *
 * Действие (например, «Проверить» от шерифа/дона) рендерится поверх — ФИИМ
 * разрешает ночные проверки мёртвых, и нам нужно дать кнопку на этот сидень.
 */
function DeadOverlay({
  seat,
  isSelf,
  action,
}: {
  seat: number | null;
  isSelf: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean } | null;
}) {
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
      <div className="absolute inset-0 flex items-center justify-center">
        <DeadSkull className="w-1/2 h-1/2 max-w-[64px] max-h-[64px]" />
      </div>
      {action && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <Button
            size="sm"
            variant={action.destructive ? 'danger' : 'primary'}
            onClick={action.onClick}
            disabled={action.disabled}
            className="w-full h-7 text-xs"
          >
            {action.label}
          </Button>
        </div>
      )}
    </>
  );
}
