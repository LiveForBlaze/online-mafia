// Desktop-only table layout (lg+): 12-tile ring grid — 10 player seats
// around the perimeter, judge and info tiles in the centre row.
//
//   P9   P10  P1   P2
//   P8   J    I    P3
//   P7   P6   P5   P4
//
// Mobile (<lg) uses MobileGameView in GamePage instead — PlayerTable is
// hidden there by its container's `hidden lg:block`.

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
  ) => { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean } | null;
  judgeControlsFor?: (participant: GameParticipantPublic) => React.ReactNode | null;
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
      {/* Desktop ring layout (lg+). The parent container is hidden on
          mobile; MobileGameView handles the <lg viewport instead. */}
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
                  // "Your turn" cue: the viewer is the one holding the floor.
                  isYourTurn={
                    participant.userId === viewerUserId && state.currentSpeakerSeat === seat
                  }
                  isNominated={state.nominationSeats.includes(seat)}
                  isDeadButSpeaking={
                    !participant.isAlive &&
                    seat === state.currentSpeakerSeat &&
                    (seat === state.farewellSeat || seat === state.lastWordSeat)
                  }
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
