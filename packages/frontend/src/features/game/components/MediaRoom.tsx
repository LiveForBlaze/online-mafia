// LiveKit room wrapper for the game page.
//
// On mount, fetches a fresh LiveKit token from the backend and connects to the room
// named game:<gameId>. Children render inside the LiveKitRoom context and can use any
// hook from @livekit/components-react (useTracks, useLocalParticipant, etc.).
//
// We deliberately do NOT auto-enable camera/microphone — users opt in through the
// SelfMediaButtons so we don't surprise people with permission prompts.
//
// IMPORTANT: even when the LiveKit token fetch fails, we still render the children
// (the game page UI — table, votes, judge panel). Losing video must not lock players
// out of the game itself.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { LiveKitRoom, RoomContext, StartAudio } from '@livekit/components-react';
import { AudioPresets, Room, type RoomOptions } from 'livekit-client';
import '@livekit/components-styles';

import { gameApi } from '@/features/game/api/game.api.js';
import { MediaAudioRouter } from './MediaAudioRouter.js';
import { AudioRecovery } from './AudioRecovery.js';

interface MediaRoomProps {
  gameId: string;
  children: React.ReactNode;
}

// Принудительно включаем AEC / NS / AGC на захвате микрофона. Без этого
// у игрока с громкими колонками голос судьи возвращался обратно в комнату
// → акустическая петля «фонит». Echo-cancellation подавляет это на стороне
// браузера ещё до отправки трека.
//
// publishDefaults.audioPreset = speech: дефолт LiveKit'а — `music` (32 kbps stereo),
// что для голосового стола из 10 человек избыточно. `speech` (24 kbps mono) даёт
// разборчивую речь, экономит исходящий канал у игроков с плохим wifi и снижает
// расход бэндвидта на сервере при росте числа столов. dtx/red — defaults
// (тишина не отправляется; устойчивость к потерям пакетов), но фиксируем
// явно чтобы при апгрейде SDK не отвалились.
//
// adaptiveStream/dynacast: video-only оптимизации, но критичны для мобильных
// и больших столов. adaptiveStream автоматически паузит подписку на видео
// тех тайлов, которые скрыты viewport'ом (мёртвые / прокручены вне экрана);
// dynacast снижает нагрузку на SFU, не публикуя слои видео, на которые никто
// не подписан. На аудио не влияет — оно остаётся непрерывным.
const ROOM_OPTIONS: RoomOptions = {
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  publishDefaults: {
    audioPreset: AudioPresets.speech,
    dtx: true,
    red: true,
  },
  adaptiveStream: true,
  dynacast: true,
};

export function MediaRoom({ gameId, children }: MediaRoomProps) {
  const { t } = useTranslation();
  const tokenQuery = useQuery({
    queryKey: ['game', gameId, 'livekit-token'],
    queryFn: () => gameApi.liveKitToken(gameId),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  // A disconnected Room instance used as a fallback context while the token is
  // loading or unavailable. Keeps LiveKit hooks (useParticipants, etc.) from
  // throwing "No room provided" — they simply return empty collections instead.
  const idleRoom = useMemo(() => new Room(), []);

  if (tokenQuery.isLoading) {
    return (
      <RoomContext.Provider value={idleRoom}>
        <MediaBanner tone="info">{t('game.media.connecting')}</MediaBanner>
        {children}
      </RoomContext.Provider>
    );
  }
  if (tokenQuery.isError || !tokenQuery.data) {
    return (
      <RoomContext.Provider value={idleRoom}>
        <MediaBanner tone="danger">{t('game.media.connectError')}</MediaBanner>
        {children}
      </RoomContext.Provider>
    );
  }

  return (
    <LiveKitRoom
      token={tokenQuery.data.token}
      serverUrl={tokenQuery.data.url}
      connect
      video={false}
      audio={false}
      options={ROOM_OPTIONS}
      data-lk-theme="default"
    >
      {children}
      {/* Audio is rendered per-participant subject to phase/role visibility rules,
          not by RoomAudioRenderer — otherwise civilians would hear the mafia at night. */}
      <MediaAudioRouter />
      {/* Если у игрока не получилось включить свой mic, браузер блокирует
          autoplay воспроизведения чужого аудио. StartAudio рисует
          пере-полноэкранную кнопку «нажмите чтобы включить звук» — она
          сама исчезает, когда блок снят. */}
      <StartAudio
        label={t('game.media.allowAudio')}
        className="fixed top-2 right-2 z-50 rounded-md border border-warning/60 bg-warning/15 text-warning px-2 py-1 text-[11px] font-semibold shadow-md hover:bg-warning/25"
      />
      {/* Recovery после reconnect — пересубскрайбит все remote audio
          публикации, чтобы пропавший звук вернулся без F5. */}
      <AudioRecovery />
    </LiveKitRoom>
  );
}

function MediaBanner({ tone, children }: { tone: 'info' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={
        tone === 'danger'
          ? 'fixed top-2 left-1/2 -translate-x-1/2 z-40 rounded-md border border-danger/40 bg-card px-3 py-1.5 text-xs text-danger shadow-lg'
          : 'fixed top-2 left-1/2 -translate-x-1/2 z-40 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted shadow-lg'
      }
    >
      {children}
    </div>
  );
}
