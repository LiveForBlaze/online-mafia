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
