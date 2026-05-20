// Table layout has two variants:
//
// Desktop (sm+): 12-tile ring grid — 10 player seats around the perimeter,
// judge and info tiles in the centre row.
//
//   P9   P10  P1   P2
//   P8   J    I    P3
//   P7   P6   P5   P4
//
// Mobile (< sm): no scroll, the whole game lives in one viewport. We hide
// the judge tile entirely and surface the stage info (phase, timer, speaker,
// check result) as a compact strip via MobileStage (rendered by the parent
// page). This component renders only the 5×2 grid of player seats.
// Tapping a tile asks the parent to open MobileSeatZoom.

import type { ReactNode } from 'react';

import type { GameParticipantPublic, GameStateProjected } from '@mafia/shared';

import { MobileSeatTile } from './MobileSeatTile.js';
import { SeatVideoTile } from './SeatVideoTile.js';

interface PlayerTableProps {
  state: GameStateProjected;
  viewerUserId: string;
  judgeTile: ReactNode;
  infoTile: ReactNode;
  actionFor?: (
    participant: GameParticipantPublic,
  ) => { label: string; onClick: () => void; disabled?: boolean } | null;
  judgeControlsFor?: (participant: GameParticipantPublic) => React.ReactNode | null;
  // Mobile-only: open the fullscreen overlay for this seat.
  onZoomSeat?: (seat: number) => void;
}

// Mapping from seat number to its position in the desktop 4×3 grid.
const SEAT_POSITION: Record<number, { col: number; row: number }> = {
  1: { col: 3, row: 1 },
  2: { col: 4, row: 1 },
  3: { col: 4, row: 2 },
  4: { col: 4, row: 3 },
  5: { col: 3, row: 3 },
  6: { col: 2, row: 3 },
  7: { col: 1, row: 3 },
  8: { col: 1, row: 2 },
  9: { col: 1, row: 1 },
  10: { col: 2, row: 1 },
};

const JUDGE_POSITION = { col: 2, row: 2 };
const INFO_POSITION = { col: 3, row: 2 };

export function PlayerTable({
  state,
  viewerUserId,
  judgeTile,
  infoTile,
  actionFor,
  judgeControlsFor,
  onZoomSeat,
}: PlayerTableProps) {
  const bySeat = new Map<number, GameParticipantPublic>();
  for (const p of state.participants) {
    if (!p.isJudge && p.seat !== null) bySeat.set(p.seat, p);
  }

  const votesAgainst = new Map<number, number>();
  for (const candidate of Object.values(state.votes)) {
    votesAgainst.set(candidate, (votesAgainst.get(candidate) ?? 0) + 1);
  }

  return (
    <>
      {/* Desktop ring layout — kicks in only at lg+ so landscape phones
          (which clear sm: at ~800px wide) still get the compact mobile grid. */}
      <div className="hidden lg:grid grid-cols-4 grid-rows-3 gap-2 w-full h-full min-h-0">
        {Object.entries(SEAT_POSITION).map(([seatKey, position]) => {
          const seat = Number(seatKey);
          const participant = bySeat.get(seat);
          return (
            <div
              key={seat}
              style={{ gridColumn: position.col, gridRow: position.row }}
              className="min-h-0"
            >
              {participant ? (
                <SeatVideoTile
                  participant={participant}
                  isSelf={participant.userId === viewerUserId}
                  isSpeaker={state.currentSpeakerSeat === seat}
                  isNominated={state.nominationSeats.includes(seat)}
                  voteCountAgainst={votesAgainst.get(seat)}
                  action={actionFor?.(participant) ?? null}
                  judgeControls={judgeControlsFor?.(participant) ?? null}
                />
              ) : (
                <EmptySeat seat={seat} />
              )}
            </div>
          );
        })}

        <div
          style={{ gridColumn: JUDGE_POSITION.col, gridRow: JUDGE_POSITION.row }}
          className="min-h-0"
        >
          {judgeTile}
        </div>

        <div
          style={{ gridColumn: INFO_POSITION.col, gridRow: INFO_POSITION.row }}
          className="min-h-0"
        >
          {infoTile}
        </div>
      </div>

      {/* Mobile 5×2 grid. Tiles stretch to fill the height the parent gives us
          so the layout adapts to portrait → landscape rotation. Judge tile
          and info tile intentionally not rendered — handled by MobileStage. */}
      <div className="lg:hidden grid grid-cols-5 grid-rows-2 gap-1.5 w-full h-full min-h-0">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seat) => {
          const participant = bySeat.get(seat);
          return (
            <MobileSeatTile
              key={seat}
              seat={seat}
              participant={participant}
              isSelf={participant?.userId === viewerUserId}
              isSpeaker={state.currentSpeakerSeat === seat}
              isNominated={state.nominationSeats.includes(seat)}
              voteCountAgainst={votesAgainst.get(seat)}
              action={participant ? (actionFor?.(participant) ?? null) : null}
              onZoom={() => onZoomSeat?.(seat)}
            />
          );
        })}
      </div>
    </>
  );
}

function EmptySeat({ seat }: { seat: number }) {
  return (
    <div className="w-full h-full min-h-0 rounded-md border border-dashed border-border bg-bg flex items-center justify-center text-sm text-muted">
      №{seat}
    </div>
  );
}
