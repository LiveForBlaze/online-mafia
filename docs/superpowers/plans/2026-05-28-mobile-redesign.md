# Mobile Game-Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mobile game view with a three-zone layout — one BIG speaker tile + a 2×5 grid of all participants + a control panel — orientation-swapped between landscape and portrait, with a Follow-Speaker toggle and a per-tile «сделать активным» pin override.

**Architecture:** A new `MobileGameView` orchestrator composes four new components (`BigSpeakerTile`, `MiniTilesGrid` (uses `MiniTile`), `MobileControlPanel`, `MiniTileActions` modal). A `useFollowSpeaker` hook derives the active seat from a tiny zustand slice (`pinnedSeat`, `isFollowingSpeaker`). All actions reuse existing `CLIENT_EVENT` dispatches; no backend changes.

**Tech Stack:** React 19, Tailwind 4 (with `landscape:` / `portrait:` modifiers), zustand store at `useGameStore`, vitest for unit tests, `@livekit/components-react` for `<VideoTrack>`. Frontend-only — no Prisma, no schemas, no shared package changes beyond what is already there.

**Spec:** `docs/superpowers/specs/2026-05-28-mobile-redesign-design.md`

---

## File Map

**Create:**

- `packages/frontend/src/features/game/components/mobile/MobileGameView.tsx` — 3-zone orchestrator
- `packages/frontend/src/features/game/components/mobile/BigSpeakerTile.tsx` — large active-seat tile
- `packages/frontend/src/features/game/components/mobile/MiniTilesGrid.tsx` — 2×5 grid container
- `packages/frontend/src/features/game/components/mobile/MiniTile.tsx` — one bare-video mini-tile
- `packages/frontend/src/features/game/components/mobile/MiniTileActions.tsx` — bottom-sheet action modal
- `packages/frontend/src/features/game/components/mobile/MobileControlPanel.tsx` — phase / timer / CTA / self-controls / overflow
- `packages/frontend/src/features/game/hooks/useFollowSpeaker.ts` — pinned-vs-following derivation
- `packages/frontend/src/features/game/hooks/useFollowSpeaker.test.ts` — unit tests for the derivation

**Modify:**

- `packages/frontend/src/features/game/store/game.store.ts` — add `pinnedSeat` + `isFollowingSpeaker` slice
- `packages/frontend/src/features/game/pages/GamePage.tsx` — render `<MobileGameView />` under `lg:hidden`, remove the old `<MobileStage>` block and the mobile-only `<MobileSeatZoom>`
- `packages/frontend/src/i18n/locales/{ru,en,uk,be,kk,ka}.json` — six locales, new strings under `game.ui.mobile.*`

**Delete (only after new components are wired and the grep confirms no callers):**

- `packages/frontend/src/features/game/components/MobileStage.tsx`
- `packages/frontend/src/features/game/components/MobileSeatTile.tsx`
- `packages/frontend/src/features/game/components/MobileSeatZoom.tsx`

---

## Task 1: Add `pinnedSeat` + `isFollowingSpeaker` to the game store

**Files:**

- Modify: `packages/frontend/src/features/game/store/game.store.ts`

- [ ] **Step 1: Read the current store**

Run: `cat packages/frontend/src/features/game/store/game.store.ts`

Confirm the existing zustand `create<GameStore>` block and the `reset` function.

- [ ] **Step 2: Add the two new fields and their setters**

Inside the `GameStore` interface (alongside `judgeOverhearAll`):

```ts
  /**
   * Mobile BIG-tile control. `pinnedSeat` is the seat the user explicitly
   * locked in the big tile via the «сделать активным» modal action.
   * `isFollowingSpeaker` is the toggle in the mobile control panel; when
   * true the big tile auto-follows whoever is currently speaking and
   * `pinnedSeat` is ignored. Pinning a seat flips the toggle to false;
   * re-enabling the toggle clears the pin.
   */
  pinnedSeat: number | null;
  isFollowingSpeaker: boolean;
  pinSeat: (seat: number) => void;
  enableFollowSpeaker: () => void;
```

Inside `create<GameStore>((set) => ({` initial values block:

```ts
  pinnedSeat: null,
  isFollowingSpeaker: true,
```

Inside the same `create` call, after `setJudgeOverhearAll`:

```ts
  pinSeat: (pinnedSeat) => set({ pinnedSeat, isFollowingSpeaker: false }),
  enableFollowSpeaker: () => set({ pinnedSeat: null, isFollowingSpeaker: true }),
```

Update `reset` to clear these too. Locate the existing `reset` line:

```ts
  reset: () => set({ state: null, isConnected: false, lastError: null, judgeOverhearAll: false }),
```

Replace with:

```ts
  reset: () =>
    set({
      state: null,
      isConnected: false,
      lastError: null,
      judgeOverhearAll: false,
      pinnedSeat: null,
      isFollowingSpeaker: true,
    }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean (the store types should infer correctly).

- [ ] **Step 4: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/store/game.store.ts
git -C /Users/blaze/online-mafia commit -m "feat(mobile): pinnedSeat + isFollowingSpeaker slice on game store"
```

---

## Task 2: `useFollowSpeaker` hook + unit tests

**Files:**

- Create: `packages/frontend/src/features/game/hooks/useFollowSpeaker.ts`
- Create: `packages/frontend/src/features/game/hooks/useFollowSpeaker.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/frontend/src/features/game/hooks/useFollowSpeaker.test.ts
import { describe, expect, it } from 'vitest';

import { resolveActiveSeat, type ActiveSeatInputs } from './useFollowSpeaker.js';

const base: ActiveSeatInputs = {
  pinnedSeat: null,
  isFollowingSpeaker: true,
  currentSpeakerSeat: null,
  farewellSeat: null,
  lastWordSeat: null,
};

describe('resolveActiveSeat', () => {
  it('returns the pinned seat when one is set, regardless of speakers', () => {
    expect(
      resolveActiveSeat({
        ...base,
        pinnedSeat: 4,
        isFollowingSpeaker: false,
        currentSpeakerSeat: 7,
        farewellSeat: 3,
      }),
    ).toBe(4);
  });

  it('returns the farewell seat when no pin is set', () => {
    expect(
      resolveActiveSeat({
        ...base,
        farewellSeat: 9,
        currentSpeakerSeat: 1,
      }),
    ).toBe(9);
  });

  it('returns the last-word seat ahead of the current speaker', () => {
    expect(
      resolveActiveSeat({
        ...base,
        lastWordSeat: 6,
        currentSpeakerSeat: 1,
      }),
    ).toBe(6);
  });

  it('returns the current speaker when no special seat is in play', () => {
    expect(
      resolveActiveSeat({
        ...base,
        currentSpeakerSeat: 2,
      }),
    ).toBe(2);
  });

  it('returns null when nothing applies (e.g. NIGHT_MAFIA with no pin)', () => {
    expect(resolveActiveSeat(base)).toBe(null);
  });

  it('still respects the pin even when isFollowingSpeaker is true (e.g. legacy mismatched state)', () => {
    // Defensive: callers should not set this combination, but if they do
    // the pin wins. Keeps the function pure / total.
    expect(
      resolveActiveSeat({
        ...base,
        pinnedSeat: 5,
        isFollowingSpeaker: true,
        currentSpeakerSeat: 8,
      }),
    ).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests, confirm FAIL**

Run: `pnpm --filter @mafia/frontend test useFollowSpeaker`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook + pure helper**

```ts
// packages/frontend/src/features/game/hooks/useFollowSpeaker.ts
//
// Mobile BIG-tile derivation.
// `resolveActiveSeat` is a pure function so it can be unit-tested without
// React. `useFollowSpeaker` is the thin hook wrapper that wires it to the
// current game state and the zustand store.

import type { GameStateProjected } from '@mafia/shared';

import { useGameStore } from '@/features/game/store/game.store.js';

export interface ActiveSeatInputs {
  pinnedSeat: number | null;
  isFollowingSpeaker: boolean;
  currentSpeakerSeat: number | null;
  farewellSeat: number | null;
  lastWordSeat: number | null;
}

export function resolveActiveSeat(args: ActiveSeatInputs): number | null {
  // 1. Explicit pin wins over everything. Even if `isFollowingSpeaker` is
  //    accidentally true alongside a non-null pin, we honour the pin —
  //    this keeps the derivation a total function.
  if (args.pinnedSeat !== null) return args.pinnedSeat;
  // 2. Farewell minute — the killed-overnight player is the one with the
  //    mic right now.
  if (args.farewellSeat !== null) return args.farewellSeat;
  // 3. Last word — same dead-but-audible semantic for the just-voted-out
  //    player.
  if (args.lastWordSeat !== null) return args.lastWordSeat;
  // 4. Regular day-phase speaker.
  if (args.currentSpeakerSeat !== null) return args.currentSpeakerSeat;
  return null;
}

export interface UseFollowSpeakerResult {
  activeSeat: number | null;
  isPinned: boolean;
  isFollowing: boolean;
  pinSeat: (seat: number) => void;
  enableFollow: () => void;
}

export function useFollowSpeaker(state: GameStateProjected | null): UseFollowSpeakerResult {
  const pinnedSeat = useGameStore((s) => s.pinnedSeat);
  const isFollowingSpeaker = useGameStore((s) => s.isFollowingSpeaker);
  const pinSeatStore = useGameStore((s) => s.pinSeat);
  const enableFollow = useGameStore((s) => s.enableFollowSpeaker);

  const activeSeat = resolveActiveSeat({
    pinnedSeat,
    isFollowingSpeaker,
    currentSpeakerSeat: state?.currentSpeakerSeat ?? null,
    farewellSeat: state?.farewellSeat ?? null,
    lastWordSeat: state?.lastWordSeat ?? null,
  });

  return {
    activeSeat,
    isPinned: pinnedSeat !== null,
    isFollowing: isFollowingSpeaker,
    pinSeat: pinSeatStore,
    enableFollow,
  };
}
```

- [ ] **Step 4: Run the tests, confirm PASS**

Run: `pnpm --filter @mafia/frontend test useFollowSpeaker`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + format**

```bash
pnpm --filter @mafia/frontend typecheck
pnpm run format
```

- [ ] **Step 6: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/hooks/useFollowSpeaker.ts packages/frontend/src/features/game/hooks/useFollowSpeaker.test.ts
git -C /Users/blaze/online-mafia commit -m "feat(mobile): useFollowSpeaker hook + unit tests"
```

---

## Task 3: `BigSpeakerTile` component

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/BigSpeakerTile.tsx`

- [ ] **Step 1: Read the existing seat tile for the LiveKit pattern**

Run: `sed -n '1,110p' packages/frontend/src/features/game/components/SeatVideoTile.tsx`

Note how `<VideoTrack>` is constructed via `lkParticipant`, `cameraPublication`, and the `useParticipants()` hook from `@livekit/components-react`. We mirror that here.

- [ ] **Step 2: Implement the component**

```tsx
// packages/frontend/src/features/game/components/mobile/BigSpeakerTile.tsx
//
// The large «active speaker» tile on mobile. Rendered by MobileGameView.
// `activeSeat` is resolved by useFollowSpeaker; this component is purely
// presentational — it does not subscribe to the store directly.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';
import { useTranslation } from 'react-i18next';

import type { GameStateProjected } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface BigSpeakerTileProps {
  state: GameStateProjected;
  activeSeat: number | null;
  isPinned: boolean;
}

export function BigSpeakerTile({ state, activeSeat, isPinned }: BigSpeakerTileProps) {
  const { t } = useTranslation();
  const participant =
    activeSeat !== null ? (state.participants.find((p) => p.seat === activeSeat) ?? null) : null;

  if (!participant) {
    return <PhasePlaceholder state={state} />;
  }

  return (
    <BigParticipantView state={state} participant={participant} isPinned={isPinned} tFallback={t} />
  );
}

function BigParticipantView({
  participant,
  isPinned,
  tFallback,
}: {
  state: GameStateProjected;
  participant: GameStateProjected['participants'][number];
  isPinned: boolean;
  tFallback: ReturnType<typeof useTranslation>['t'];
}) {
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participant.userId);
  const videoPubsMap = lkParticipant
    ? (lkParticipant.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const cameraPublication = videoPubsMap
    ? Array.from(videoPubsMap.values()).find((pub) => pub.source === Track.Source.Camera)
    : undefined;
  const mayWatch = useShouldShowMedia(participant.userId);
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;

  return (
    <div className="relative w-full h-full min-h-0 rounded-md overflow-hidden border border-border bg-card">
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
        <div className="absolute inset-0 flex items-center justify-center bg-card-deep">
          <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={128} />
        </div>
      )}
      <span className="absolute top-2 left-3 text-3xl font-extrabold text-fg leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
        {participant.seat}
      </span>
      {isPinned && (
        <span className="absolute top-2 right-2 rounded-full bg-warning/85 text-fg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
          {tFallback('game.ui.mobile.pinned')}
        </span>
      )}
    </div>
  );
}

function PhasePlaceholder({ state }: { state: GameStateProjected }) {
  const { t } = useTranslation();
  return (
    <div className="relative w-full h-full min-h-0 rounded-md overflow-hidden border border-border bg-card-deep flex flex-col items-center justify-center gap-2 text-muted">
      <p className="text-xs uppercase tracking-wider">
        {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
      </p>
      <p className="text-lg font-semibold text-fg text-center px-4">
        {t(`game.phase.${state.phase}`)}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean. (The i18n key `game.ui.mobile.pinned` doesn't exist yet — that's fine because i18next falls back to the key string and we'll add the string in Task 9. Typecheck only validates that we passed a string.)

- [ ] **Step 4: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/BigSpeakerTile.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): BigSpeakerTile component"
```

---

## Task 4: `MiniTile` component

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/MiniTile.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/frontend/src/features/game/components/mobile/MiniTile.tsx
//
// One bare-video tile in the mobile 2×5 grid. The full UI (nickname,
// foul count, vote tally, etc.) is intentionally not on the tile — those
// surface inside MiniTileActions when the user taps the tile.

import { useParticipants, VideoTrack } from '@livekit/components-react';
import { Track, type TrackPublication } from 'livekit-client';

import { FOUL_MUTE_THRESHOLD, FOUL_REMOVE_THRESHOLD } from '@mafia/shared';
import type { GameStateProjected } from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { cn } from '@/lib/cn.js';
import { useShouldShowMedia } from '@/features/game/hooks/useShouldShowMedia.js';

interface MiniTileProps {
  participant: GameStateProjected['participants'][number];
  isSpeaker: boolean;
  isNominated: boolean;
  voteCountAgainst: number;
  isActive: boolean;
  onTap: () => void;
}

export function MiniTile({
  participant,
  isSpeaker,
  isNominated,
  voteCountAgainst,
  isActive,
  onTap,
}: MiniTileProps) {
  const liveKitParticipants = useParticipants();
  const lkParticipant = liveKitParticipants.find((p) => p.identity === participant.userId);
  const videoPubsMap = lkParticipant
    ? (lkParticipant.videoTrackPublications as Map<string, TrackPublication>)
    : null;
  const cameraPublication = videoPubsMap
    ? Array.from(videoPubsMap.values()).find((pub) => pub.source === Track.Source.Camera)
    : undefined;
  const mayWatch = useShouldShowMedia(participant.userId);
  const hasCameraTrack = Boolean(cameraPublication?.track && !cameraPublication.isMuted);
  const showCamera = hasCameraTrack && mayWatch;
  const isDead = !participant.isAlive;

  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        'relative w-full aspect-square rounded-sm overflow-hidden bg-card-deep',
        // Subtle outlines only when something noteworthy is going on; default tile is bare.
        isSpeaker && 'ring-1 ring-accent',
        isActive && 'ring-2 ring-warning',
        isNominated && !isSpeaker && 'ring-1 ring-warning',
        !isSpeaker && !isActive && !isNominated && 'border border-border/30',
      )}
      aria-label={`${participant.nickname} (seat ${participant.seat ?? '—'})`}
    >
      {!isDead && hasCameraTrack && lkParticipant && cameraPublication && (
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
      {!isDead && !showCamera && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={32} />
        </div>
      )}
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center text-2xl text-muted">
          💀
        </div>
      )}
      {/* Seat number — small, top-left. */}
      <span className="absolute top-0.5 left-1 text-sm font-extrabold text-fg leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
        {participant.seat ?? '—'}
      </span>
      {/* Vote count against this seat. */}
      {voteCountAgainst > 0 && (
        <span className="absolute top-0.5 right-1 rounded bg-warning/85 text-white text-[10px] font-semibold leading-none px-1 py-0.5">
          {voteCountAgainst}
        </span>
      )}
      {/* Foul dot — yellow for 1-2, red for 3, red-bold for 4. */}
      {participant.foulsCount > 0 && (
        <span
          className={cn(
            'absolute bottom-0.5 left-1 rounded-full leading-none text-white text-[10px] font-bold px-1',
            participant.foulsCount >= FOUL_REMOVE_THRESHOLD
              ? 'bg-danger'
              : participant.foulsCount >= FOUL_MUTE_THRESHOLD
                ? 'bg-danger/80'
                : 'bg-warning/85',
          )}
        >
          {participant.foulsCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/MiniTile.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): MiniTile bare-video component"
```

---

## Task 5: `MiniTilesGrid` component

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/MiniTilesGrid.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/frontend/src/features/game/components/mobile/MiniTilesGrid.tsx
//
// 2×5 grid of MiniTile, one per non-judge participant ordered by seat.
// The grid never scrolls — ten seats always fit because the row count is
// fixed at five. Tap on a tile opens the MiniTileActions modal via the
// parent.

import type { GameStateProjected } from '@mafia/shared';

import { MiniTile } from './MiniTile.js';

interface MiniTilesGridProps {
  state: GameStateProjected;
  activeSeat: number | null;
  onTap: (seat: number) => void;
}

export function MiniTilesGrid({ state, activeSeat, onTap }: MiniTilesGridProps) {
  // Seat 1..10 in order; non-judge participants only.
  const participants = state.participants
    .filter((p) => !p.isJudge && p.seat !== null)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  // Pre-compute vote counts so each MiniTile gets an O(1) lookup.
  const votesAgainst = new Map<number, number>();
  for (const candidate of Object.values(state.votes)) {
    votesAgainst.set(candidate, (votesAgainst.get(candidate) ?? 0) + 1);
  }

  return (
    <div className="w-full h-full min-h-0 grid grid-cols-5 grid-rows-2 gap-1 p-1">
      {participants.map((p) => (
        <MiniTile
          key={p.userId}
          participant={p}
          isSpeaker={p.seat !== null && p.seat === state.currentSpeakerSeat}
          isNominated={p.seat !== null && state.nominationSeats.includes(p.seat)}
          voteCountAgainst={p.seat !== null ? (votesAgainst.get(p.seat) ?? 0) : 0}
          isActive={p.seat !== null && p.seat === activeSeat}
          onTap={() => p.seat !== null && onTap(p.seat)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/MiniTilesGrid.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): MiniTilesGrid 2×5 layout"
```

---

## Task 6: `MiniTileActions` modal

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/MiniTileActions.tsx`

- [ ] **Step 1: Read the existing actionForSeat resolver for the night-action mapping**

Run: `sed -n '1,110p' packages/frontend/src/features/game/lib/actionForSeat.ts`

We do not reuse `actionForSeatInCurrentPhase` directly because the mobile modal exposes multiple actions per tile (not a single CTA), but the per-role/phase decision logic is the same and we mirror it inline.

- [ ] **Step 2: Implement**

```tsx
// packages/frontend/src/features/game/components/mobile/MiniTileActions.tsx
//
// Bottom-sheet action modal for a tapped mini-tile. Contents depend on the
// viewer's role and the current game phase. Every action maps onto an
// existing CLIENT_EVENT; nothing new is wired on the backend.

import { useTranslation } from 'react-i18next';

import {
  CLIENT_EVENT,
  DAY_PHASES,
  GAME_PHASE,
  ROLE,
  type GameStateProjected,
  type Role,
} from '@mafia/shared';

import { Avatar } from '@/components/ui/Avatar.js';
import { Button } from '@/components/ui/Button.js';
import { Dialog } from '@/components/ui/Dialog.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';

interface MiniTileActionsProps {
  state: GameStateProjected;
  seat: number;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsJudge: boolean;
  onClose: () => void;
}

export function MiniTileActions({
  state,
  seat,
  viewerRole,
  viewerSeat,
  viewerIsJudge,
  onClose,
}: MiniTileActionsProps) {
  const { t } = useTranslation();
  const pinSeat = useGameStore((s) => s.pinSeat);

  const participant = state.participants.find((p) => p.seat === seat);
  if (!participant) return null;

  function dispatch(action: () => void) {
    action();
    onClose();
  }

  const isNominated = state.nominationSeats.includes(seat);
  const phase = state.phase;
  const isSelf = viewerSeat === seat;

  // Build the list of buttons.
  type Action = {
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'danger';
  };
  const actions: Action[] = [];

  if (viewerIsJudge) {
    if (DAY_PHASES.includes(phase)) {
      actions.push({
        key: 'foul',
        label: t('game.ui.issueFoul'),
        disabled: participant.foulsCount >= 4,
        onClick: () =>
          emitGameAction(CLIENT_EVENT.JUDGE_ISSUE_FOUL, { targetUserId: participant.userId }),
      });
      actions.push({
        key: 'unfoul',
        label: t('game.ui.removeFoul'),
        disabled: participant.foulsCount <= 0,
        onClick: () =>
          emitGameAction(CLIENT_EVENT.JUDGE_REVOKE_FOUL, { targetUserId: participant.userId }),
      });
    }
    if (phase === GAME_PHASE.DAY_SPEECH && !isNominated) {
      actions.push({
        key: 'nominate',
        label: t('game.ui.nominateButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: seat }),
      });
    }
    if ((phase === GAME_PHASE.DAY_SPEECH || phase === GAME_PHASE.DAY_VOTE_INTRO) && isNominated) {
      actions.push({
        key: 'unnominate',
        label: t('game.ui.unnominate'),
        onClick: () => emitGameAction(CLIENT_EVENT.UNNOMINATE_PLAYER, { targetSeat: seat }),
      });
    }
    actions.push({
      key: 'remove',
      label: t('game.ui.removePlayer'),
      variant: 'danger',
      onClick: () =>
        emitGameAction(CLIENT_EVENT.JUDGE_REMOVE_PLAYER, { targetUserId: participant.userId }),
    });
  } else {
    // Player actions, gated by role + phase.
    if (
      phase === GAME_PHASE.NIGHT_MAFIA &&
      (viewerRole === ROLE.MAFIA || viewerRole === ROLE.DON) &&
      !isSelf
    ) {
      actions.push({
        key: 'shoot',
        label: t('game.ui.shootButton'),
        disabled: state.myMafiaVote !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.MAFIA_TARGET, { targetSeat: seat }),
      });
    }
    if (phase === GAME_PHASE.NIGHT_DON && viewerRole === ROLE.DON && !isSelf) {
      actions.push({
        key: 'don',
        label: t('game.ui.checkButton'),
        disabled: state.myCheckResult !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.DON_CHECK, { targetSeat: seat }),
      });
    }
    if (phase === GAME_PHASE.NIGHT_SHERIFF && viewerRole === ROLE.SHERIFF && !isSelf) {
      actions.push({
        key: 'sheriff',
        label: t('game.ui.checkButton'),
        disabled: state.myCheckResult !== null,
        variant: 'primary',
        onClick: () => emitGameAction(CLIENT_EVENT.SHERIFF_CHECK, { targetSeat: seat }),
      });
    }
  }

  // «Сделать активным» is always last and always available unless it's
  // already the active tile (we'd pin its own seat to itself, no-op).
  if (!isSelf) {
    actions.push({
      key: 'pin',
      label: t('game.ui.mobile.makeActive'),
      onClick: () => pinSeat(seat),
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar avatarUrl={participant.avatarUrl} nickname={participant.nickname} size={48} />
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-wider text-muted">
            {t('game.ui.seatLabel', { n: seat })}
          </p>
          <p className="text-base font-semibold text-fg truncate">{participant.nickname}</p>
          {participant.role && (
            <p className="text-xs text-muted">{t(`game.role.${participant.role}`)}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {actions.length === 0 ? (
          <p className="text-sm text-muted text-center py-2">
            {t('game.ui.mobile.noActionsAvailable')}
          </p>
        ) : (
          actions.map((a) => (
            <Button
              key={a.key}
              onClick={() => dispatch(a.onClick)}
              disabled={a.disabled}
              className={
                a.variant === 'danger'
                  ? 'bg-danger hover:bg-danger/90 text-white'
                  : a.variant === 'primary'
                    ? ''
                    : 'bg-card hover:bg-card/80 text-fg border border-border'
              }
            >
              {a.label}
            </Button>
          ))
        )}
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify `Dialog` exists**

Run: `ls packages/frontend/src/components/ui/Dialog.tsx`

If it doesn't exist, replace `Dialog` with the project's modal component. Check what's used by `ConfirmDialog.tsx`:

```bash
grep -n "from '@/components/ui" packages/frontend/src/components/ui/ConfirmDialog.tsx
```

Match that import in `MiniTileActions.tsx`. If the project doesn't have a generic dialog, copy the inline-overlay pattern from `ConfirmDialog.tsx` (a `<div className="fixed inset-0 ...">` overlay) and use that markup directly inside `MiniTileActions`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean. Some i18n keys (`game.ui.mobile.*`, `game.ui.seatLabel`, `game.ui.nominateButton`) may not yet exist in JSON — that's fine for typecheck (i18next is untyped at the call site).

- [ ] **Step 5: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/MiniTileActions.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): MiniTileActions bottom-sheet modal"
```

---

## Task 7: `MobileControlPanel` component

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/MobileControlPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/frontend/src/features/game/components/mobile/MobileControlPanel.tsx
//
// The right strip (landscape) / bottom strip (portrait) of the mobile
// game view. Holds phase + timer + Follow-Speaker toggle + main CTA +
// self-controls + overflow menu.

import { useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { useTranslation } from 'react-i18next';

import {
  CLIENT_EVENT,
  DAY_PHASES,
  FOUL_REMOVE_THRESHOLD,
  GAME_PHASE,
  type GameStateProjected,
  type Role,
} from '@mafia/shared';

import { Button } from '@/components/ui/Button.js';
import { cn } from '@/lib/cn.js';
import { formatCountdown, useCountdown } from '@/features/game/hooks/useCountdown.js';
import { emitGameAction } from '@/features/game/socket/game.socket.js';
import { useGameStore } from '@/features/game/store/game.store.js';

interface MobileControlPanelProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  onOpenLog: () => void;
  onLeaveGame: () => void;
}

export function MobileControlPanel(props: MobileControlPanelProps) {
  const { state, viewerRole, viewerSeat, viewerIsAlive, viewerIsJudge, onOpenLog, onLeaveGame } =
    props;
  const { t } = useTranslation();
  const { secondsLeft, expired, warning, hasTimer } = useCountdown(
    state.phaseDeadline,
    state.phaseStartedAt,
  );
  const isFollowing = useGameStore((s) => s.isFollowingSpeaker);
  const enableFollow = useGameStore((s) => s.enableFollowSpeaker);
  const pinSeat = useGameStore((s) => s.pinSeat);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const viewer = viewerSeat !== null ? state.participants.find((p) => p.seat === viewerSeat) : null;
  const foulCount = viewer?.foulsCount ?? 0;

  const currentCandidate =
    state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE
      ? state.nominationSeats[state.voteRoundIdx]
      : undefined;
  const canCastVote =
    !viewerIsJudge &&
    viewerIsAlive &&
    currentCandidate !== undefined &&
    viewerSeat !== currentCandidate &&
    !Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));

  const canSayOutOfTurn =
    !viewerIsJudge &&
    viewerIsAlive &&
    foulCount < FOUL_REMOVE_THRESHOLD &&
    DAY_PHASES.includes(state.phase) &&
    state.phase !== GAME_PHASE.DAY_VOTE_INTRO &&
    state.phase !== GAME_PHASE.DAY_VOTE &&
    state.phase !== GAME_PHASE.DAY_REVOTE &&
    state.phase !== GAME_PHASE.DAY_LIFT_VOTE &&
    viewerSeat !== state.currentSpeakerSeat;

  function toggleFollow() {
    if (isFollowing) {
      // Going OFF: pin whoever is currently «active» (= speaker, in this branch).
      if (state.currentSpeakerSeat !== null) pinSeat(state.currentSpeakerSeat);
    } else {
      enableFollow();
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-card-deep rounded-md border border-border p-2 gap-2">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">
          {state.dayNumber > 0 ? t('game.ui.day', { n: state.dayNumber }) : t('game.ui.match')}
        </p>
        <p className="text-sm font-semibold text-fg leading-tight">
          {t(`game.phase.${state.phase}`)}
        </p>
      </div>

      {hasTimer && (
        <p
          className={cn(
            'text-2xl font-bold tabular-nums leading-none',
            expired ? 'text-danger' : warning ? 'text-warning' : 'text-fg',
          )}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}

      <button
        type="button"
        onClick={toggleFollow}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider transition self-start',
          isFollowing
            ? 'border-accent/60 bg-accent/15 text-accent'
            : 'border-border bg-card text-muted',
        )}
      >
        <span
          className={cn(
            'inline-block w-2 h-2 rounded-full',
            isFollowing ? 'bg-accent' : 'bg-muted',
          )}
        />
        {t('game.ui.mobile.followSpeaker')}
      </button>

      <div className="flex-1" />

      {viewerIsJudge && (
        <Button
          onClick={() => emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_SPEAKER)}
          disabled={state.status === 'finished'}
          className="w-full"
        >
          {t('game.ui.advanceStep')}
        </Button>
      )}
      {canCastVote && (
        <Button
          onClick={() =>
            currentCandidate !== undefined &&
            emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: currentCandidate })
          }
          className="w-full bg-danger hover:bg-danger/90"
        >
          {t('game.ui.voteForButton')}
        </Button>
      )}
      {state.phase === GAME_PHASE.DAY_LIFT_VOTE && !viewerIsJudge && viewerIsAlive && (
        <div className="grid grid-cols-2 gap-1">
          <Button
            onClick={() => emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes: true })}
            className="w-full bg-danger hover:bg-danger/90"
          >
            {t('game.ui.liftYes')}
          </Button>
          <Button
            onClick={() => emitGameAction(CLIENT_EVENT.LIFT_ALL_VOTE, { yes: false })}
            className="w-full"
          >
            {t('game.ui.liftNo')}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
            } catch {
              window.alert(t('game.media.micFailed'));
            }
          }}
          aria-label={t(isMicrophoneEnabled ? 'game.ui.micDisable' : 'game.ui.micEnable')}
          className={cn(
            'flex-1 h-8 rounded-md text-xs',
            isMicrophoneEnabled ? 'bg-black/60 text-white' : 'bg-danger/80 text-white',
          )}
        >
          🎤
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await localParticipant.setCameraEnabled(!isCameraEnabled);
            } catch {
              window.alert(t('game.media.cameraFailed'));
            }
          }}
          aria-label={t(isCameraEnabled ? 'game.ui.cameraDisable' : 'game.ui.cameraEnable')}
          className={cn(
            'flex-1 h-8 rounded-md text-xs',
            isCameraEnabled ? 'bg-black/60 text-white' : 'bg-danger/80 text-white',
          )}
        >
          📷
        </button>
        <button
          type="button"
          onClick={() => setOverflowOpen((v) => !v)}
          aria-label={t('game.ui.mobile.more')}
          className="w-8 h-8 rounded-md bg-card border border-border text-fg"
        >
          ⋯
        </button>
      </div>

      {overflowOpen && (
        <div className="rounded-md border border-border bg-card p-1 flex flex-col gap-1">
          {canSayOutOfTurn && (
            <button
              type="button"
              onClick={() => {
                emitGameAction(CLIENT_EVENT.SAY_OUT_OF_TURN);
                setOverflowOpen(false);
              }}
              className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
            >
              {t('game.ui.sayOutOfTurn')}
            </button>
          )}
          {viewerIsJudge && (
            <>
              <button
                type="button"
                onClick={() => {
                  emitGameAction(CLIENT_EVENT.JUDGE_REVERT);
                  setOverflowOpen(false);
                }}
                className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
              >
                {t('game.ui.revertStep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenLog();
                  setOverflowOpen(false);
                }}
                className="text-left text-xs px-2 py-1 hover:bg-bg rounded"
              >
                {t('game.ui.openLog')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              onLeaveGame();
              setOverflowOpen(false);
            }}
            className="text-left text-xs px-2 py-1 hover:bg-bg rounded text-danger"
          >
            {t('game.ui.leaveGame')}
          </button>
        </div>
      )}
      <span aria-hidden className="hidden">
        {viewerRole}
      </span>
    </div>
  );
}
```

(The `viewerRole` is consumed by the modal, not the panel — but we accept it as a prop in case future panel content depends on role. The trailing `<span hidden>` keeps TypeScript from flagging it as unused.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/MobileControlPanel.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): MobileControlPanel — phase, timer, CTA, self, overflow"
```

---

## Task 8: `MobileGameView` orchestrator + orientation switch

**Files:**

- Create: `packages/frontend/src/features/game/components/mobile/MobileGameView.tsx`

- [ ] **Step 1: Implement**

```tsx
// packages/frontend/src/features/game/components/mobile/MobileGameView.tsx
//
// The three-zone mobile layout. Composed of BigSpeakerTile + MiniTilesGrid +
// MobileControlPanel. Orientation drives whether zones stack vertically
// (portrait) or sit side-by-side (landscape) — handled purely in CSS via
// Tailwind's `landscape:` and `portrait:` modifiers, no resize listeners.

import { useState } from 'react';

import type { GameStateProjected, Role } from '@mafia/shared';

import { useFollowSpeaker } from '@/features/game/hooks/useFollowSpeaker.js';

import { BigSpeakerTile } from './BigSpeakerTile.js';
import { MiniTileActions } from './MiniTileActions.js';
import { MiniTilesGrid } from './MiniTilesGrid.js';
import { MobileControlPanel } from './MobileControlPanel.js';

interface MobileGameViewProps {
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  onOpenLog: () => void;
  onLeaveGame: () => void;
}

export function MobileGameView(props: MobileGameViewProps) {
  const { activeSeat, isPinned } = useFollowSpeaker(props.state);
  const [openSeat, setOpenSeat] = useState<number | null>(null);

  return (
    <>
      <div
        className={[
          // Lock the layout to the viewport — no document scroll on mobile.
          'flex-1 min-h-0 grid gap-1 p-1',
          // Portrait: rows = BIG (40%) | grid (40%) | panel (20%)
          'portrait:grid-rows-[2fr_2fr_1fr] portrait:grid-cols-1',
          // Landscape: columns = BIG (50%) | grid (30%) | panel (20%)
          'landscape:grid-cols-[1fr_0.6fr_0.4fr] landscape:grid-rows-1',
        ].join(' ')}
      >
        <BigSpeakerTile state={props.state} activeSeat={activeSeat} isPinned={isPinned} />
        <MiniTilesGrid
          state={props.state}
          activeSeat={activeSeat}
          onTap={(seat) => setOpenSeat(seat)}
        />
        <MobileControlPanel
          state={props.state}
          viewerRole={props.viewerRole}
          viewerSeat={props.viewerSeat}
          viewerIsAlive={props.viewerIsAlive}
          viewerIsJudge={props.viewerIsJudge}
          onOpenLog={props.onOpenLog}
          onLeaveGame={props.onLeaveGame}
        />
      </div>
      {openSeat !== null && (
        <MiniTileActions
          state={props.state}
          seat={openSeat}
          viewerRole={props.viewerRole}
          viewerSeat={props.viewerSeat}
          viewerIsJudge={props.viewerIsJudge}
          onClose={() => setOpenSeat(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/components/mobile/MobileGameView.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): MobileGameView 3-zone orchestrator"
```

---

## Task 9: i18n keys (6 locales)

**Files:**

- Modify: `packages/frontend/src/i18n/locales/ru.json`
- Modify: `packages/frontend/src/i18n/locales/en.json`
- Modify: `packages/frontend/src/i18n/locales/uk.json`
- Modify: `packages/frontend/src/i18n/locales/be.json`
- Modify: `packages/frontend/src/i18n/locales/kk.json`
- Modify: `packages/frontend/src/i18n/locales/ka.json`

- [ ] **Step 1: Inventory the new keys**

The mobile components reference these new strings:

| Key                                 | RU                          | EN                            |
| ----------------------------------- | --------------------------- | ----------------------------- |
| `game.ui.mobile.pinned`             | «Активный»                  | «Pinned»                      |
| `game.ui.mobile.followSpeaker`      | «За говорящим»              | «Follow speaker»              |
| `game.ui.mobile.makeActive`         | «Сделать активным»          | «Make active»                 |
| `game.ui.mobile.noActionsAvailable` | «Ничего не доступно сейчас» | «Nothing available right now» |
| `game.ui.mobile.more`               | «Ещё»                       | «More»                        |
| `game.ui.seatLabel`                 | «Сидень {{n}}»              | «Seat {{n}}»                  |
| `game.ui.nominateButton`            | «Выставить»                 | «Nominate»                    |
| `game.ui.revertStep`                | «Отменить шаг»              | «Revert step»                 |
| `game.ui.openLog`                   | «Журнал партии»             | «Game log»                    |
| `game.ui.leaveGame`                 | «Выйти из игры»             | «Leave game»                  |
| `game.ui.liftYes`                   | «За подъём»                 | «Lift all»                    |
| `game.ui.liftNo`                    | «Против»                    | «Keep»                        |

Several may already exist (`leaveGame`, `liftYes`/`liftNo`, `revertStep`, `nominateButton`). Verify with grep before adding duplicates:

```bash
grep -n "leaveGame\|nominateButton\|revertStep\|liftYes\|liftNo\|openLog\|seatLabel" packages/frontend/src/i18n/locales/ru.json
```

Only add the keys that are missing.

- [ ] **Step 2: Update all six locale files**

Use a small Python helper at the repo root (one-shot, no commit):

```bash
python3 <<'PY'
import json
from pathlib import Path

DIR = Path('packages/frontend/src/i18n/locales')
KEYS = {
  'ru': {
    'mobile.pinned': 'Активный',
    'mobile.followSpeaker': 'За говорящим',
    'mobile.makeActive': 'Сделать активным',
    'mobile.noActionsAvailable': 'Ничего не доступно сейчас',
    'mobile.more': 'Ещё',
    'seatLabel': 'Сидень {{n}}',
    'nominateButton': 'Выставить',
    'revertStep': 'Отменить шаг',
    'openLog': 'Журнал партии',
    'leaveGame': 'Выйти из игры',
    'liftYes': 'За подъём',
    'liftNo': 'Против',
  },
  'en': {
    'mobile.pinned': 'Pinned',
    'mobile.followSpeaker': 'Follow speaker',
    'mobile.makeActive': 'Make active',
    'mobile.noActionsAvailable': 'Nothing available right now',
    'mobile.more': 'More',
    'seatLabel': 'Seat {{n}}',
    'nominateButton': 'Nominate',
    'revertStep': 'Revert step',
    'openLog': 'Game log',
    'leaveGame': 'Leave game',
    'liftYes': 'Lift all',
    'liftNo': 'Keep',
  },
  'uk': {
    'mobile.pinned': 'Активний',
    'mobile.followSpeaker': 'За мовцем',
    'mobile.makeActive': 'Зробити активним',
    'mobile.noActionsAvailable': 'Зараз нічого недоступно',
    'mobile.more': 'Ще',
    'seatLabel': 'Місце {{n}}',
    'nominateButton': 'Виставити',
    'revertStep': 'Скасувати крок',
    'openLog': 'Журнал партії',
    'leaveGame': 'Вийти з гри',
    'liftYes': 'За підняття',
    'liftNo': 'Проти',
  },
  'be': {
    'mobile.pinned': 'Актыўны',
    'mobile.followSpeaker': 'За тым, хто гаворыць',
    'mobile.makeActive': 'Зрабіць актыўным',
    'mobile.noActionsAvailable': 'Зараз нічога недаступна',
    'mobile.more': 'Яшчэ',
    'seatLabel': 'Месца {{n}}',
    'nominateButton': 'Выставіць',
    'revertStep': 'Скасаваць крок',
    'openLog': 'Журнал партыі',
    'leaveGame': 'Выйсці з гульні',
    'liftYes': 'За пад'ём',
    'liftNo': 'Супраць',
  },
  'kk': {
    'mobile.pinned': 'Белсенді',
    'mobile.followSpeaker': 'Сөйлеушіге',
    'mobile.makeActive': 'Белсенді ету',
    'mobile.noActionsAvailable': 'Қазір ештеңе қолжетімді емес',
    'mobile.more': 'Тағы',
    'seatLabel': 'Орын {{n}}',
    'nominateButton': 'Ұсыну',
    'revertStep': 'Қадамды қайтару',
    'openLog': 'Ойын журналы',
    'leaveGame': 'Ойыннан шығу',
    'liftYes': 'Көтеру',
    'liftNo': 'Қарсы',
  },
  'ka': {
    'mobile.pinned': 'აქტიური',
    'mobile.followSpeaker': 'მოლაპარაკეს',
    'mobile.makeActive': 'აქტიურად დაყენება',
    'mobile.noActionsAvailable': 'ამჟამად არაფერია ხელმისაწვდომი',
    'mobile.more': 'მეტი',
    'seatLabel': 'ადგილი {{n}}',
    'nominateButton': 'წარდგენა',
    'revertStep': 'ნაბიჯის გაუქმება',
    'openLog': 'თამაშის ჟურნალი',
    'leaveGame': 'თამაშიდან გასვლა',
    'liftYes': 'მხარდასაჭერად',
    'liftNo': 'წინააღმდეგ',
  },
}

def set_nested(node, dotted, value):
    parts = dotted.split('.')
    cur = node
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = value

for fp in sorted(DIR.glob('*.json')):
    locale = fp.stem
    if locale not in KEYS:
        continue
    with fp.open() as f:
        d = json.load(f)
    target = d.setdefault('game', {}).setdefault('ui', {})
    for k, v in KEYS[locale].items():
        # Only set if missing — keep the existing translations for keys that
        # already exist (e.g. leaveGame, nominateButton may be there).
        # Use dotted-key navigation.
        head, *_ = k.split('.')
        if k == head:
            if k not in target:
                target[k] = v
        else:
            sub = target.setdefault(head, {})
            tail = k.split('.', 1)[1]
            if tail not in sub:
                sub[tail] = v
    with fp.open('w') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{fp.name}: ok')
PY
```

- [ ] **Step 3: Format**

Run: `pnpm run format`

- [ ] **Step 4: Sanity-check the keys landed**

```bash
python3 -c "
import json
for loc in ['ru','en','uk','be','kk','ka']:
  d = json.load(open(f'packages/frontend/src/i18n/locales/{loc}.json'))
  ui = d.get('game', {}).get('ui', {})
  mobile = ui.get('mobile', {})
  required_mobile = {'pinned','followSpeaker','makeActive','noActionsAvailable','more'}
  required_ui = {'seatLabel','liftYes','liftNo'}
  missing_m = required_mobile - set(mobile.keys())
  missing_u = required_ui - set(ui.keys())
  print(loc, 'mobile-missing:', missing_m or 'OK', 'ui-missing:', missing_u or 'OK')
"
```

Expected: every locale prints `mobile-missing: OK ui-missing: OK`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/i18n/locales/be.json packages/frontend/src/i18n/locales/en.json packages/frontend/src/i18n/locales/ka.json packages/frontend/src/i18n/locales/kk.json packages/frontend/src/i18n/locales/ru.json packages/frontend/src/i18n/locales/uk.json
git -C /Users/blaze/online-mafia commit -m "i18n(mobile): keys for new mobile game view (6 locales)"
```

---

## Task 10: Wire into `GamePage` + delete the old mobile components

**Files:**

- Modify: `packages/frontend/src/features/game/pages/GamePage.tsx`
- Delete: `packages/frontend/src/features/game/components/MobileStage.tsx`
- Delete: `packages/frontend/src/features/game/components/MobileSeatTile.tsx`
- Delete: `packages/frontend/src/features/game/components/MobileSeatZoom.tsx`

- [ ] **Step 1: Read the current GamePage**

Run: `sed -n '1,260p' packages/frontend/src/features/game/pages/GamePage.tsx`

Find the existing `<div className="lg:hidden">` block that holds `<MobileStage>`, the conditional `<MobileSeatZoom>` rendering, and `setZoomedSeat` state.

- [ ] **Step 2: Replace the lg:hidden block with `<MobileGameView />`**

Inside `GamePage.tsx`:

- Remove the imports for `MobileSeatZoom`, `MobileStage`, and the `zoomedSeat` `useState` along with its usage.
- Add the import:
  ```ts
  import { MobileGameView } from '@/features/game/components/mobile/MobileGameView.js';
  ```
- Replace the `<div className="lg:hidden"> ... </div>` block (the one containing `<MobileStage>`) with:
  ```tsx
  <div className="lg:hidden flex-1 min-h-0 flex flex-col">
    <MobileGameView
      state={state}
      viewerRole={viewerRole}
      viewerSeat={viewerSeat}
      viewerIsAlive={viewerIsAlive}
      viewerIsJudge={viewerIsJudge}
      onOpenLog={() => setShowLog(true)}
      onLeaveGame={() => setShowLeaveConfirm(true)}
    />
  </div>
  ```
- Remove the `<MobileSeatZoom>` conditional rendering block entirely.
- The desktop block (the `<PlayerTable />` / `<InfoTile />` / `<JudgeTile />` ring) is unchanged.

- [ ] **Step 3: Confirm no other callers of the old components**

```bash
grep -rn "MobileStage\|MobileSeatTile\|MobileSeatZoom" packages/frontend/src --include="*.ts" --include="*.tsx"
```

Expected output: only the file definitions themselves (the three files we're about to delete). If any other caller appears, fix that caller first — common cases:

- `PlayerTable.tsx` may import `MobileSeatTile` for its mobile branch. If so, replace `<MobileSeatTile>` with `<SeatVideoTile>` so the desktop component handles both — `<PlayerTable>` is desktop-only after this change anyway, so the mobile branch can simply be deleted.

- [ ] **Step 4: Delete the three files**

```bash
rm packages/frontend/src/features/game/components/MobileStage.tsx
rm packages/frontend/src/features/game/components/MobileSeatTile.tsx
rm packages/frontend/src/features/game/components/MobileSeatZoom.tsx
```

- [ ] **Step 5: Re-grep to confirm clean removal**

```bash
grep -rn "MobileStage\|MobileSeatTile\|MobileSeatZoom" packages/frontend/src --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 6: Run full preflight**

```bash
pnpm --filter @mafia/frontend typecheck
pnpm --filter @mafia/frontend test
pnpm run format:check
```

Expected: typecheck clean, frontend tests pass (7 useCountdown + 6 useFollowSpeaker = 13), prettier clean.

- [ ] **Step 7: Manual smoke (run dev locally with two browser windows)**

Start dev servers:

```bash
pnpm dev
```

In one Chromium window, open `http://localhost:5173`, create a lobby, fill with bots, start a game. Resize the window to a phone size (DevTools device toolbar, iPhone 14 portrait). Confirm:

- BIG tile, 2×5 mini grid, control panel all visible without scrolling.
- Phase, day, timer render in the panel.
- Tap a mini tile → modal opens.
- Modal contains «сделать активным» plus role-appropriate buttons.
- «Сделать активным» pins the seat; BIG locks to that seat.
- Toggle in the panel: tapping it unpins and BIG returns to follow.
- Rotate to landscape; layout reflows to BIG-left | grid-middle | panel-right without page reload.

- [ ] **Step 8: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/pages/GamePage.tsx
git -C /Users/blaze/online-mafia rm packages/frontend/src/features/game/components/MobileStage.tsx packages/frontend/src/features/game/components/MobileSeatTile.tsx packages/frontend/src/features/game/components/MobileSeatZoom.tsx
git -C /Users/blaze/online-mafia commit -m "feat(mobile): wire MobileGameView into GamePage, drop legacy mobile components"
```

---

## Task 11: End-to-end smoke + push

- [ ] **Step 1: Full repo-level preflight**

```bash
pnpm run typecheck
pnpm --filter @mafia/backend test
pnpm --filter @mafia/frontend test
pnpm run format:check
```

Expected: typecheck clean, 148 backend tests passing (unchanged — this epic is frontend-only), 13 frontend tests passing, prettier clean.

- [ ] **Step 2: Quick visual review of the diff stat**

```bash
git -C /Users/blaze/online-mafia log --oneline --stat $(git -C /Users/blaze/online-mafia merge-base origin/main HEAD)..HEAD
```

Confirm: only files under `packages/frontend/src/features/game/components/mobile/`, `hooks/useFollowSpeaker*`, `store/game.store.ts`, `pages/GamePage.tsx`, `i18n/locales/*.json` are touched. The three legacy `Mobile*` files are deleted. Nothing in `packages/backend/` or `packages/shared/`.

- [ ] **Step 3: Push to main**

```bash
git -C /Users/blaze/online-mafia push origin main
```

CI deploys to `89.167.60.120`.

- [ ] **Step 4: Smoke on prod (phone, real device)**

After CI deploy completes, open the prod site on a real phone (or DevTools mobile emulation in a non-dev browser). Walk through a quick bot-filled game and confirm:

- Layout renders correctly in both orientations.
- BIG follows the speaker as expected during DAY_SPEECH.
- Pinning a seat persists until the toggle is flipped back to ON.
- Modal opens cleanly and dispatches actions (nominate, foul, etc.).
- Vote CTA appears in the panel during DAY_VOTE, dispatches, hides after the viewer votes.
- Mic / camera toggles work.
- Overflow menu shows the right entries (revert + log for judge, leave for everyone).
- No 404 spam in console; no uncaught exceptions; no console.error from React.

- [ ] **Step 5: Done**

There is no follow-up commit needed unless smoke reveals an issue. If it does, file the issue as a separate task and reuse subagent-driven-development to fix it.

---

## Self-Review

**Spec coverage**

- Layout (three-zone, orientation swap): Task 8 (MobileGameView grid classes) + Task 10 (wire).
- BIG content priority (pin → farewell → last-word → speaker → placeholder): Task 2 (`resolveActiveSeat`) + Task 3 (`BigSpeakerTile` PhasePlaceholder).
- Mini-tile contents (bare video + minimal indicators): Task 4 (`MiniTile`) + Task 5 (`MiniTilesGrid`).
- Modal contents per role × phase: Task 6 (`MiniTileActions`).
- Panel contents (phase, timer, toggle, CTA, self-controls, overflow): Task 7 (`MobileControlPanel`).
- Hook + store: Tasks 1–2.
- i18n: Task 9.
- Wire-in + cleanup of legacy: Task 10.
- Smoke + push: Task 11.

**Placeholder scan**: No "TBD" / "TODO" / "fill in later". Every step that changes code shows the code. Every command has an Expected line.

**Type consistency**: `pinSeat`, `enableFollow`, `enableFollowSpeaker`, `useFollowSpeaker`, `BigSpeakerTile`, `MiniTile`, `MiniTilesGrid`, `MiniTileActions`, `MobileControlPanel`, `MobileGameView`, `resolveActiveSeat` — used consistently across tasks. Store fields `pinnedSeat` / `isFollowingSpeaker` match between Task 1 (store) and Task 2 (hook).
