# Media (LiveKit + audio rules)

Every game uses a single LiveKit room named `game:<gameId>`. Tokens are
short-lived (30 min), per-game, per-user. The backend signs them; the
LiveKit server doesn't know anything about mafia rules — visibility is
enforced **per-viewer client-side**.

## Why per-viewer

A black-team player needs to see the don's video at NIGHT_ZERO. A
civilian must not. The «who can see who» matrix changes phase by phase
and role by role; encoding all 14 phases into LiveKit subscription
permissions would be brittle. Instead we leave subscriptions open and
filter on the consumer side in `media-visibility.ts`.

This is documented as a known limitation: a determined client could
bypass the gate from DevTools. The fix (server-side
`updateSubscriptions` per phase change) is on the roadmap but not
strictly required for fair play in a casual community.

## Visibility rules

### Video (`shouldShowParticipantMedia`)

| Situation                                                        | Visible?                                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Judge's camera                                                   | Always                                                                                             |
| Dead player                                                      | Only if `currentSpeakerSeat === farewellSeat / lastWordSeat` and the speaker minute hasn't expired |
| `PLAYER_INTRODUCTION`, `MORNING_ANNOUNCEMENT`, any `DAY_*`       | Every alive player                                                                                 |
| `NIGHT_ZERO`                                                     | Mafia + don see each other; nobody else                                                            |
| `ROLE_DISTRIBUTION`, `NIGHT_MAFIA`, `NIGHT_DON`, `NIGHT_SHERIFF` | Only judge                                                                                         |
| `GAME_OVER`                                                      | Everyone                                                                                           |

### Audio (`shouldHearParticipantAudio`)

Tighter than video. Daytime: silence except the current speaker's minute.

| Situation                                                                | Audible?                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Target is yourself                                                       | Never (feedback)                                                                                       |
| Target is the judge                                                      | Always (announcements)                                                                                 |
| Viewer is the judge, `judgeOverhearAll === true`                         | Hears everyone                                                                                         |
| Viewer is the judge, `judgeOverhearAll === false` (default)              | Hears only the game flow (current speaker / out-of-turn / farewell / lastWord) — same as a live player |
| Active out-of-turn 5s window (target acquired it)                        | Audible during the window, day phases only                                                             |
| Target is `farewellSeat` / `lastWordSeat`                                | Audible while their minute hasn't expired                                                              |
| Dead viewer                                                              | Hears everything                                                                                       |
| `PLAYER_INTRODUCTION`, `GAME_OVER`                                       | All open mic                                                                                           |
| Any `DAY_*` phase + target is `currentSpeakerSeat`                       | Audible until `phaseDeadline + 1.5s grace`                                                             |
| Any night phase, `MORNING_ANNOUNCEMENT`, `ROLE_DISTRIBUTION` (non-judge) | Silent                                                                                                 |

The **1.5 s grace** after `phaseDeadline` covers client-clock drift and
the gap between server-side timer fire and the next `GAME_STATE_DELTA`.
Without it the last syllable of a speaker's minute could be cut.

## Judge overhear toggle

Default is **off** — the judge hears the same audio as a live player.
Switching it on (header «Hear all» badge) restores the «judge hears
everything» behaviour. Useful for moderation; harmful with loud
speakers because the judge's mic returns voices from its own speakers
back into the room → echo loop. We default to off for exactly that
reason.

Implementation: zustand store flag `judgeOverhearAll`, threaded through
`useMediaArgs` into `shouldHearParticipantAudio`.

## Browser autoplay gate

Browsers (Chrome, Safari, Firefox mobile) suspend the AudioContext until
a user gesture. A player who never touches the mic toggle would never
hear anyone. We surface LiveKit's `<StartAudio>` button — it only paints
itself when autoplay is blocked, then auto-hides.

## Echo cancellation

Every LiveKit microphone capture is created with:

```ts
audioCaptureDefaults: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

This is configured on the `LiveKitRoom` once in `MediaRoom.tsx`. Without
it players with external speakers (no AEC chain) returned the judge's
voice back into the room, producing a feedback loop.

For players who insist on speakers, the judge-overhear toggle being off
breaks the chain even when AEC is unavailable.

## Reconnect resilience

Both the auto-managed reconnect and a manual restart-on-stuck-frame are
wired:

| Trigger                         | Effect                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| LiveKit `RoomEvent.Reconnected` | `AudioRecovery` resubscribes every remote microphone publication (setSubscribed false → 200ms → true). |
| Manual «↻» on a seat tile       | Same for that one participant's camera publication via `restartCameraSubscription`.                    |

## Token revocation

LiveKit tokens are bearer credentials valid until TTL (30 min). When a
user is removed from the game (judge kick, self-leave) or logs out, we
call `RoomServiceClient.removeParticipant` so they're booted out before
the TTL runs down. See `revokeLiveKitForUser` in `game.livekit.ts`.

## Self-state

Camera and microphone are owned by the local participant —
`SelfMediaButtons.tsx` toggles them. Failures (permission deny, busy
device, dropped Bluetooth) surface a user-visible alert instead of
silently flipping the icon — earlier the «meine не слышат» complaints
traced back to a silently-failed `setMicrophoneEnabled`.

## Files

| File                                                         | What's there                                   |
| ------------------------------------------------------------ | ---------------------------------------------- |
| `frontend/src/features/game/components/MediaRoom.tsx`        | LiveKitRoom wrapper, AEC defaults, StartAudio. |
| `frontend/src/features/game/components/MediaAudioRouter.tsx` | Per-track audio elements with volume gate.     |
| `frontend/src/features/game/components/AudioRecovery.tsx`    | Reconnect-resilient re-subscribe.              |
| `frontend/src/features/game/components/SelfMediaButtons.tsx` | Mic/camera/foul toggles + error handling.      |
| `frontend/src/features/game/hooks/useShouldShowMedia.ts`     | React hooks → media-visibility lib.            |
| `frontend/src/features/game/lib/media-visibility.ts`         | Pure visibility/audibility rules.              |
| `frontend/src/features/game/lib/restart-video.ts`            | Per-participant camera re-subscribe.           |
| `backend/src/modules/game/game.livekit.ts`                   | Token issuance + revoke.                       |
| `backend/src/modules/game/game.media-permissions.ts`         | `canPublish` flips when a player is removed.   |
