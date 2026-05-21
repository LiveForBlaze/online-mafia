// Replaces <RoomAudioRenderer> with selective audio rendering.
//
// Instead of mixing every remote audio track into a single output (which would
// let a civilian hear the mafia at night), we render one <AudioTrack> per
// subscribed mic and silence it via volume when the viewer is not allowed to
// hear that participant.
//
// We deliberately keep every <AudioTrack> mounted for the full lifetime of the
// subscription rather than unmounting it when audibility flips. Unmounting was
// causing audible dropouts: when the rule flipped false → true (phase change,
// speaker advance, etc.), the AudioTrack would re-mount, re-attach to the
// HTMLMediaElement, and miss in-flight audio. Now the element stays attached
// continuously; we just toggle its volume.
//
// NOTE: client-side enforcement only. See media-visibility.ts for the security
// caveat.

import { AudioTrack, useTracks, isTrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';

import { useShouldHearAudio } from '@/features/game/hooks/useShouldShowMedia.js';

export function MediaAudioRouter() {
  const audioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: true,
  });

  return (
    <>
      {audioTracks.filter(isTrackReference).map((trackRef) => (
        <AudibleIfAllowed
          key={trackRef.participant.identity + ':' + trackRef.source}
          trackRef={trackRef}
        />
      ))}
    </>
  );
}

function AudibleIfAllowed({
  trackRef,
}: {
  trackRef: ReturnType<typeof useTracks>[number] & { publication: NonNullable<unknown> };
}) {
  const mayHear = useShouldHearAudio(trackRef.participant.identity);
  // Always render — control audibility via volume so the underlying media
  // element keeps its attachment across audibility flips.
  return <AudioTrack trackRef={trackRef} volume={mayHear ? 1 : 0} />;
}
