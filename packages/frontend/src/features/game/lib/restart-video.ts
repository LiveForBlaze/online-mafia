// Перезапуск видеопотока конкретного участника на стороне ЭТОГО клиента.
// Не трогает источник (камеру участника), не дёргает других. Просто
// отписывается от его camera-публикации и подписывается заново —
// LiveKit поднимет новый decoder, что обычно лечит «застывший» кадр.
//
// Возможные причины зависания, которые лечит re-subscribe:
//   - jitter / packet loss → decoder заклинило между ключевыми кадрами;
//   - sleep tab / device wake → элемент <video> отлип от трека;
//   - смена сети у viewer'а → нужно пересоздать subscription.
//
// Источник участника при этом не трогается — мы лишь меняем то, что
// показывается локально. Стороне участника операция невидима.

import {
  RemoteParticipant,
  Track,
  type Participant,
  type RemoteTrackPublication,
} from 'livekit-client';

const RESUBSCRIBE_GAP_MS = 200;

// Returns a cancel handle that clears the pending re-subscribe timer. Callers
// that live inside a React effect should invoke it on cleanup so the deferred
// `setSubscribed(true)` can't fire after unmount. Fire-and-forget click handlers
// can safely ignore the return value (happy path is unchanged: a no-op cancel).
export function restartCameraSubscription(participant: Participant | undefined): () => void {
  // Re-subscribe имеет смысл только для удалённых участников. На LocalParticipant
  // это не сработает — поток исходит от нас, а не приходит извне.
  if (!participant || !(participant instanceof RemoteParticipant)) return () => {};
  const pubs = participant.videoTrackPublications as Map<string, RemoteTrackPublication>;
  const cameraPub = Array.from(pubs.values()).find((p) => p.source === Track.Source.Camera);
  if (!cameraPub) return () => {};

  cameraPub.setSubscribed(false);
  // Маленькая пауза, чтобы у SDK дошёл off-state до повторной подписки.
  // Без неё LiveKit может «съесть» одну из операций как идемпотентную.
  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    cameraPub.setSubscribed(true);
  }, RESUBSCRIBE_GAP_MS);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
