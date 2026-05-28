# Mobile game-page redesign — design

**Status:** approved 2026-05-28 (brainstorm)
**Audience of the feature:** all logged-in players on phones (portrait and landscape). Tablets fall under desktop or mobile depending on width.
**Drives bug:** #13 from the playtest report — «надо переработать мобильный вид».

## Goal

Replace the current mobile game view with a three-zone layout built around one
big speaker tile plus a small grid of all ten participants, so a player on a
phone can see the active speaker clearly and still keep all ten faces in
peripheral vision. The current mobile layout reuses the desktop ring at a
smaller scale and hides important controls below the fold; players reported
that voting and tally are off-screen and judging is impractical.

## Non-goals

- No desktop layout changes. Desktop ring + InfoTile stays as it is.
- No backend changes. This is a pure frontend rework — `<VideoTrack>`s,
  audio routing, projection, and event handling are all reused as-is.
- No new game mechanics. Every action wired up on mobile maps to an
  existing `CLIENT_EVENT` (nominate, vote, judge actions, etc.).
- No live-streaming / spectator-mode interaction. Spectator mode is a
  separate feature.

## Layout

Three zones, swapped between rows and columns by orientation.

**Landscape (the primary case for sport mafia on a phone — hands free, phone
on a stand or table):**

```
┌─────────────┬─────────────────────┬────────┐
│             │  ○○ ○○ ○○ ○○ ○○     │ ▸ фаза │
│   BIG       │  ○○ ○○ ○○ ○○ ○○     │  1:34  │
│  (~50%)     │  2×5 mini, no       │ ────── │
│             │  chrome             │[Далее] │
│             │                     │ ────── │
│             │                     │ 🎤📷⋯  │
└─────────────┴─────────────────────┴────────┘
     ~50%             ~30%             ~20%
```

**Portrait:**

```
┌──────────────────────┐
│        BIG           │
│      (~40%)          │
├──────────────────────┤
│  ○○ ○○ ○○ ○○ ○○      │
│  ○○ ○○ ○○ ○○ ○○      │  grid (~40%)
├──────────────────────┤
│ ▸ фаза · 1:34        │
│ [Далее]   🎤 📷 ⋯    │  panel (~20%)
└──────────────────────┘
```

The page locks the viewport: no document scroll. Each zone is internally
self-contained (no overflow), so the grid never pushes the panel below the
fold and the panel never pushes the grid off the screen.

## BIG-окно — content rules

The big tile shows one of the following, in priority order:

1. **Pinned seat.** The user has tapped a mini-tile and chosen «сделать
   активным» — the BIG locks to that seat until they revert.
2. **Farewell / last-word seat** — when `state.farewellSeat` or
   `state.lastWordSeat` is set, the BIG follows it (these are «the player who
   is speaking right now» even though they are technically dead).
3. **Current speaker** — `state.currentSpeakerSeat` during day phases and
   shootout / lift-vote / role-distribution that has a speaker.
4. **Phase placeholder** — when no seat applies (NIGHT\_\*, MORNING_ANNOUNCEMENT,
   GAME_OVER, ROLE_DISTRIBUTION-before-pick) the BIG shows a phase glyph plus
   `t('game.phase.<phase>')` + day number on a card-bg background.

Rules 2–4 collectively make up the «auto-follow speaker» behaviour. Rule 1 is
the override. The toggle in the panel controls whether rule 1 stays in effect:
when the toggle is ON, picking «сделать активным» turns it OFF (locking the
BIG); flipping the toggle back to ON drops the pin and resumes auto-follow.

The BIG tile has no overlaid game UI besides the seat number (top-left small)
and an «off-follow» indicator (top-right small chip when pinned). Foul
counters and role badges are NOT shown in the BIG — those live on mini-tiles
and in the panel context.

## Mini-tile grid (2×5)

Ten tiles, two rows of five. Aspect ratio approximately 4:3 or square,
whichever fits without overflow inside the grid zone. Tile contents:

- The participant's live `<VideoTrack>` (or static placeholder if camera off
  or the viewer's projection forbids the camera).
- Seat number (top-left, small).
- That is the default. The following indicators light up conditionally:
  - **Speaker** — thin pulsing accent border (NOT a heavy ring like desktop,
    visible but unobtrusive).
  - **Nominated** — small warning chip in the corner.
  - **Vote count** — small badge with the number of votes against this seat
    during DAY_VOTE / DAY_REVOTE.
  - **Foul count ≥ 1** — small dot (yellow for 1–2, red for 3, red-bold for
    4 which means the player was auto-disqualified).
  - **Dead** — full-tile skull overlay (same DeadOverlay as desktop, scaled
    down). Tap on a dead seat opens the modal too — judge actions like
    «фол-» are still meaningful on dead participants and don/sheriff can
    target dead per recent rule fix.
- No nickname text by default. Nickname appears inside the action modal when
  the tile is tapped.

The grid never scrolls. Ten seats always fit because the row is fixed at
five tiles.

## Modal — tap-on-mini

Tap opens a bottom-sheet modal centred on the tapped seat. Modal contents are
filtered by viewer role and game phase. All buttons map 1-to-1 onto existing
`CLIENT_EVENT` payloads — no new server actions are introduced.

Header of the modal: nickname, seat number, role badge (when the viewer's
projection allows seeing it). Below the header:

| Viewer × phase                                                               | Modal actions                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Judge × DAY_SPEECH                                                           | фол+, фол− (disabled if 0), выставить, снять (if seat in nominationSeats), удалить, **сделать активным** |
| Judge × DAY_VOTE_INTRO                                                       | фол+, фол−, снять (if in nominationSeats), удалить, **сделать активным**                                 |
| Judge × DAY_VOTE / DAY_REVOTE / DAY_SHOOTOUT / DAY_LIFT_VOTE / DAY_LAST_WORD | фол+, фол−, удалить, **сделать активным**                                                                |
| Judge × any NIGHT\_\* / MORNING_ANNOUNCEMENT / ROLE_DISTRIBUTION             | удалить, **сделать активным**                                                                            |
| Mafia / Don × NIGHT_MAFIA                                                    | стрелять (disabled if already shot or target self), **сделать активным**                                 |
| Don × NIGHT_DON                                                              | проверить (disabled if already checked or target self), **сделать активным**                             |
| Sheriff × NIGHT_SHERIFF                                                      | проверить (disabled if already checked or target self), **сделать активным**                             |
| Any other (alive player day-phase, etc.)                                     | **сделать активным** only                                                                                |

Tap on the viewer's own seat is special-cased: no modal opens. Instead the
mini-tile renders inline mic / camera toggles when tapped, since the
self-action surface is purely media-controls. The «сказать под фол» button
lives in the panel overflow during day-speech phases (see panel section
below).

The modal exits via tap outside the sheet, swipe-down, or pressing the
hardware back button.

## Right / bottom panel (~20%)

A small fixed strip with everything that's universally relevant:

1. **Phase + day** — one line. «Ночь» / «Утро» / «День 2» / «Игра окончена».
2. **Timer** — mm:ss in tabular-nums. Hidden when there is no timer for the
   current phase (MORNING_ANNOUNCEMENT-without-deadline, lobby, GAME_OVER).
3. **Toggle: «Follow speaker»** — a compact switch. ON by default. Tooltip
   on long-press explains the behaviour.
4. **Main CTA** — context-driven, one big button:
   - Judge: «Далее» (advance step / phase).
   - Player in DAY_VOTE / DAY_REVOTE where the current candidate is valid for
     the viewer's seat and the viewer hasn't voted yet: «ЗА».
   - Player in DAY_LIFT_VOTE: pair of «За подъём» / «Против» (yes/no).
   - Player in DAY_SHOOTOUT during their own minute: «Сказать под фол» is
     suppressed (they have the mic legitimately); CTA is empty.
   - Player whose turn it is to speak: empty CTA, just a hint line «Ваша
     очередь».
   - Otherwise: short hint («Ждём шерифа», «Ждём мафию», «Ждём дона»,
     «Голосуют»).
5. **Self-controls row** — mic toggle, camera toggle. Located at the bottom
   of the panel so the thumb reaches them with the phone in landscape grip.
6. **Overflow menu (·· · button)** — opens a small popover with:
   - «Сказать под фол» (only enabled in DAY_SPEECH / DAY_SHOOTOUT /
     DAY_LAST_WORD).
   - «Отменить шаг» (judge only).
   - «Журнал партии» (judge only, opens existing GameLogDialog).
   - «Выйти из игры» (red).

Everything in the panel is keyboard-accessible (Tab order top to bottom),
because the desktop hotkey scheme (Space = ЗА / Дальше) still ships and the
panel is the natural focus target on mobile-keyboard devices.

## Viewport and orientation handling

- Viewport-locked: `min-h-screen [height:100dvh] overflow-hidden`. We already
  do this on desktop game page.
- Orientation switch: Tailwind utility classes via `landscape:` and
  `portrait:` modifiers. No JS resize listeners — CSS handles the swap.
- Breakpoint: the mobile layout activates below `lg` (1024 px). Above that,
  the existing desktop ring is shown.
- Safe-area: the panel and the BIG tile respect iOS safe-area insets (use
  the project's existing `pb-[env(safe-area-inset-bottom)]` pattern from
  GamePage where applicable).

## Hooks and state

A single new hook centralises the BIG-tile state:

```ts
// features/game/hooks/useFollowSpeaker.ts
export function useFollowSpeaker(state: GameStateProjected | null): {
  activeSeat: number | null;
  isFollowing: boolean;
  pinSeat: (seat: number) => void;
  enableFollow: () => void;
};
```

- `activeSeat` is what the BIG tile renders. Resolution order matches the
  rules above (pinned → farewell → last-word → current speaker → null).
- `isFollowing` is the toggle state. Pinning via `pinSeat` flips it to
  false; calling `enableFollow()` resets the pin and flips it back to true.
- The hook stores `{ pinnedSeat, isFollowing }` in a zustand slice on the
  existing `useGameStore` so the modal action «сделать активным» can write
  to it and the panel toggle can read it.

The hook has no side effects; it is a pure derivation plus a small setter
API. The BIG-tile component reads it; the modal calls `pinSeat`; the toggle
calls `enableFollow` or `pinSeat(state.currentSpeakerSeat)` depending on the
direction.

## Components — file map

**Create:**

- `packages/frontend/src/features/game/components/mobile/MobileGameView.tsx` —
  top-level orchestrator. Replaces the current `MobileStage.tsx` block inside
  `GamePage.tsx`. Owns the three-zone grid and orientation classes.
- `packages/frontend/src/features/game/components/mobile/BigSpeakerTile.tsx` —
  BIG tile. Reads from `useFollowSpeaker`. Renders a single `<VideoTrack>`
  or a phase placeholder.
- `packages/frontend/src/features/game/components/mobile/MiniTilesGrid.tsx` —
  2×5 grid. Renders one `MiniTile` per non-judge participant. (Judge seat is
  rendered separately or excluded — see "Judge" below.)
- `packages/frontend/src/features/game/components/mobile/MiniTile.tsx` —
  the bare-video tile. Owns its onClick → opens modal.
- `packages/frontend/src/features/game/components/mobile/MiniTileActions.tsx` —
  the action sheet. Receives `seat`, role+phase context, dispatches existing
  `emitGameAction` calls.
- `packages/frontend/src/features/game/components/mobile/MobileControlPanel.tsx`
  — phase + timer + CTA + self-controls + overflow.
- `packages/frontend/src/features/game/hooks/useFollowSpeaker.ts` — the
  derivation + setter hook described above.

**Modify:**

- `packages/frontend/src/features/game/pages/GamePage.tsx` — replace the
  existing `<MobileStage>` + `<PlayerTable>` mobile block with
  `<MobileGameView />`. Keep the desktop ring untouched.
- `packages/frontend/src/features/game/store/game.store.ts` — add the
  `pinnedSeat` and `isFollowingSpeaker` slice + setters.
- i18n locale files (ru / en / uk / be / kk / ka) — new keys for modal
  actions and panel hints. Existing keys (advance, vote, foul, remove,
  unnominate, etc.) are reused.

**Delete:**

- `packages/frontend/src/features/game/components/MobileStage.tsx`,
  `MobileSeatTile.tsx`, `MobileSeatZoom.tsx` after the new components ship
  and no callers remain. Verified by grep before removal.

## Judge

The judge is treated identically to a player in this layout. The mini-grid
shows the ten game participants (judge excluded — judge has no seat anyway).
The judge's existing seat-tile equivalent on desktop is the
`JudgeTile.tsx` — on mobile it does not appear in the grid. The judge's
controls (foul, remove, unnominate, advance step) are surfaced through the
mini-tile modal and the main CTA. The «Журнал партии» button lives under
the overflow «···» menu.

This is a deliberate scope choice: making the judge see a full panorama of
all ten players is the desktop story. On mobile the judge uses the same
big-plus-grid view as players, with control affordances under taps. Sport-
mafia judging on a phone is a secondary use case; the design is built for
players first.

## Existing patterns we reuse

- `<VideoTrack trackRef={...}>` from `@livekit/components-react` — both BIG
  and mini tiles render this with the same trackRef construction as
  `SeatVideoTile.tsx`.
- `useShouldShowMedia(targetUserId)` — for camera projection. Mini-tile
  applies it the same way the existing seat does.
- `useShouldHearAudio` — audio routing is unchanged; `<MediaAudioRouter>` at
  the page level keeps managing per-track volume regardless of which tile
  rendered the video.
- `emitGameAction` for all action dispatch.
- `pushDiag` (just added in the system-logs epic) — fire from the modal on
  «сделать активным» so we can correlate pin actions in the debug log.

## Visual style

- Mini-tiles: no border by default. Subtle 1-px `border-border/30` only when
  ambient indicators (foul, votes, nomination) are present, otherwise the
  tile is just video edge-to-edge.
- BIG tile: 1-px `border-border` always (so the rounded corners read as a
  separate surface), plus a soft `accent` ring when the pinned seat is also
  the current speaker (visual reinforcement of «who's talking»).
- Phase placeholder: `bg-card-deep` with the phase icon centred + day
  number / phase name in muted text. Match the existing `InfoTile`'s phase
  glyph.
- Foul / vote / nomination chips: same colour palette as the desktop tile
  for consistency.

## Testing

No backend tests. Frontend testing approach:

- Pure logic in `useFollowSpeaker` is unit-tested with vitest: priority
  resolution (pinned beats speaker, farewell beats speaker, no-speaker
  returns null), and the setter API (`pinSeat` flips `isFollowing` false,
  `enableFollow` resets the pin).
- Component snapshots are NOT added. The mobile components are
  layout-heavy and we'd rather iterate on visuals than freeze them in
  snapshot diffs.
- Manual smoke checklist after each major task — see implementation plan.

## Out of scope, intentionally

- Animations between phase placeholders / video. Cross-fade is nice but is a
  later polish pass.
- Picture-in-picture, native fullscreen on mini-tap, double-tap to zoom.
  Modal «сделать активным» covers the «show me bigger» use case.
- Custom drag-to-reorder the mini-grid. Order is fixed by seat number, the
  same on every device.
- Per-user persistence of «which seat I pinned last game». Pin resets at
  game end and on page navigation.

## Open questions

None. Design ready for an implementation plan.
