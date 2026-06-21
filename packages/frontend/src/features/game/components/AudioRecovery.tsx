// Восстановление подписок на чужие микрофоны после reconnect.
//
// Жалоба «у такого-то seat'а пропал звук» обычно случается так:
//   1. У игрока сетевой моргнул (mobile, weak wifi).
//   2. LiveKit делает reconnect.
//   3. Часть аудио-публикаций других участников теряет subscription'ы,
//      и сами не восстанавливаются.
// Это лечится тем же приёмом, что у видео (restartCameraSubscription):
// `setSubscribed(false) → пауза → setSubscribed(true)` для каждой
// remote-audio-публикации. Делаем автоматически на каждом RoomEvent.Reconnected.

import { useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent, Track, type RemoteTrackPublication } from 'livekit-client';

const RESUBSCRIBE_GAP_MS = 200;

export function AudioRecovery(): null {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    // Track every pending re-subscribe timer so we can cancel them on unmount —
    // otherwise a timer can fire after the component is gone and poke a stale
    // publication.
    const pendingTimers = new Set<number>();

    function restartAllRemoteAudio() {
      room.remoteParticipants.forEach((participant) => {
        const pubs = participant.audioTrackPublications as Map<string, RemoteTrackPublication>;
        pubs.forEach((pub) => {
          if (pub.source !== Track.Source.Microphone) return;
          pub.setSubscribed(false);
          const timer = window.setTimeout(() => {
            pendingTimers.delete(timer);
            pub.setSubscribed(true);
          }, RESUBSCRIBE_GAP_MS);
          pendingTimers.add(timer);
        });
      });
    }

    room.on(RoomEvent.Reconnected, restartAllRemoteAudio);
    return () => {
      room.off(RoomEvent.Reconnected, restartAllRemoteAudio);
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
      pendingTimers.clear();
    };
  }, [room]);

  return null;
}
