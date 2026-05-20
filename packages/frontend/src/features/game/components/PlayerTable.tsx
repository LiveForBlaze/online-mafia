// 12-tile grid laid out in a ring: 10 player seats around the perimeter,
// judge and info tiles in the middle of the centre row.
//
// Seat numbers run clockwise starting from the top of the table — seat 1 sits
// just to the right of centre at the top:
//
//   P9   P10  P1   P2
//   P8   J    I    P3
//   P7   P6   P5   P4
//
// Grid is always 4×3 — on smaller screens the cells just shrink uniformly. We
// considered a stacked mobile fallback but the circular metaphor is the point
// of the layout, so we keep it intact at every breakpoint.

import type { ReactNode } from 'react';

import type { GameParticipantPublic, GameStateProjected } from '@mafia/shared';

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
}

// Mapping from seat number to its position in the 4-column × 3-row CSS grid.
// Seat 1 sits at the top, just right of centre; the ring runs clockwise.
// (col, row) are 1-based as CSS grid expects.
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
    // The grid fills the whole area given to it by the page layout. With 4 cols × 3 rows,
    // every cell ends up the same size; the cell shape follows the available area
    // (landscape on desktop, near-square otherwise). Video uses object-cover so it
    // crops naturally to fit each cell.
    <div className="grid grid-cols-4 grid-rows-3 gap-2 w-full h-full min-h-0">
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
  );
}

function EmptySeat({ seat }: { seat: number }) {
  return (
    <div className="w-full h-full min-h-0 rounded-md border border-dashed border-border bg-bg flex items-center justify-center text-sm text-muted">
      №{seat}
    </div>
  );
}
