// Replaces <RoomAudioRenderer> with selective audio rendering.
//
// Instead of mixing every remote audio track into a single output (which would let a
// civilian hear the mafia at night), we render an <AudioTrack> only for participants
// the viewer is allowed to hear, using the same visibility rules as for video.
//
// NOTE: client-side enforcement only. See media-visibility.ts for the security caveat.

import { AudioTrack, useTracks, isTrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';

import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

export function MediaAudioRouter() {
  const audioTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: true },
  );

  return (
    <>
      {audioTracks.filter(isTrackReference).map((trackRef) => (
        <AudibleIfAllowed key={trackRef.participant.identity + ':' + trackRef.source} trackRef={trackRef} />
      ))}
    </>
  );
}

function AudibleIfAllowed({
  trackRef,
}: {
  trackRef: ReturnType<typeof useTracks>[number] & { publication: NonNullable<unknown> };
}) {
  // Hooks must be called unconditionally — we run the visibility check inside the
  // child component (one per track) so its dependency on game state is cleanly scoped.
  const mayHear = useShouldShowMedia(trackRef.participant.identity);
  if (!mayHear) return null;
  return <AudioTrack trackRef={trackRef} />;
}
