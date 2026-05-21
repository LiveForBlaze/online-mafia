// Spacebar hotkey for casting "ЗА" during sequential voting.
//
// At a real-life mafia table the judge says "три-четыре" and voters raise
// their hand. Online — pressing space is the closest physical analogue:
// no aim, no click target hunting, just a single keystroke at the right
// moment. The hotkey is active only when the viewer is actually eligible
// to vote in the current round, so a tap during night or while waiting
// silently does nothing.

import { useEffect } from 'react';

import { CLIENT_EVENT, GAME_PHASE, type GameStateProjected } from '@mafia/shared';

import { emitGameAction } from '@/features/game/socket/game.socket.js';

export function useVoteHotkey(
  state: GameStateProjected | null,
  viewerSeat: number | null,
  viewerIsAlive: boolean,
): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      if (!state) return;
      // Don't steal space from inputs / textareas / contenteditable surfaces —
      // typing space in a chat field should never cast a vote.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (event.repeat) return;

      // Eligibility: must be in a voting phase, viewer alive non-judge, hasn't
      // voted yet, and there's a candidate to vote for. The viewer also can't
      // vote for themselves — same constraint as the on-tile "ЗА" button.
      const isVotePhase =
        state.phase === GAME_PHASE.DAY_VOTE || state.phase === GAME_PHASE.DAY_REVOTE;
      if (!isVotePhase) return;
      if (!viewerIsAlive || viewerSeat === null) return;

      const candidate = state.nominationSeats[state.voteRoundIdx];
      if (candidate === undefined) return; // round window has closed
      if (candidate === viewerSeat) return; // can't vote for yourself

      const alreadyVoted = Object.prototype.hasOwnProperty.call(state.votes, String(viewerSeat));
      if (alreadyVoted) return;

      event.preventDefault();
      void emitGameAction(CLIENT_EVENT.CAST_VOTE, { candidateSeat: candidate });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, viewerSeat, viewerIsAlive]);
}
