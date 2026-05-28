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

  it('still respects the pin even when isFollowingSpeaker is true (legacy mismatched state)', () => {
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
