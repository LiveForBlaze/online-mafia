import type { GameStateProjected } from '@mafia/shared';

import { MiniTile } from './MiniTile.js';

interface MiniTilesGridProps {
  state: GameStateProjected;
  activeSeat: number | null;
  onTap: (seat: number) => void;
}

export function MiniTilesGrid({ state, activeSeat, onTap }: MiniTilesGridProps) {
  const participants = state.participants
    .filter((p) => !p.isJudge && p.seat !== null)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  // Pre-compute vote counts per candidate so each MiniTile gets an O(1) lookup.
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
