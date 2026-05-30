import { describe, expect, it } from 'vitest';

import { GAME_PHASE, ROLE } from '@mafia/shared';

import {
  type MediaVisibilityArgs,
  shouldHearParticipantAudio,
  shouldShowParticipantMedia,
} from './media-visibility.js';

// A neutral baseline: an alive civilian viewer looking at another alive civilian,
// during a night-mafia phase (the most "locked down" common case). Each test
// overrides only the fields it exercises.
function args(overrides: Partial<MediaVisibilityArgs> = {}): MediaVisibilityArgs {
  return {
    phase: GAME_PHASE.NIGHT_MAFIA,
    status: 'in_progress',

    viewerUserId: 'viewer',
    viewerRole: ROLE.CIVILIAN,
    viewerIsJudge: false,
    viewerIsAlive: true,

    targetUserId: 'target',
    targetSeat: 2,
    targetRole: ROLE.CIVILIAN,
    targetIsJudge: false,
    targetIsAlive: true,

    currentSpeakerSeat: null,
    phaseDeadline: null,
    now: 1_000,
    outOfTurnSpeaker: null,
    farewellSeat: null,
    lastWordSeat: null,
    judgeOverhearAll: false,
    ...overrides,
  };
}

const DEADLINE = '2026-01-01T00:00:00.000Z';
const DEADLINE_MS = Date.parse(DEADLINE);

describe('shouldShowParticipantMedia (video)', () => {
  it('always shows the judge, even at night', () => {
    expect(shouldShowParticipantMedia(args({ targetIsJudge: true }))).toBe(true);
  });

  it('hides a dead player during a normal night', () => {
    expect(shouldShowParticipantMedia(args({ targetIsAlive: false }))).toBe(false);
  });

  it('shows a dead farewell speaker before their deadline passes', () => {
    expect(
      shouldShowParticipantMedia(
        args({
          targetIsAlive: false,
          targetSeat: 5,
          farewellSeat: 5,
          phaseDeadline: DEADLINE,
          now: DEADLINE_MS - 1_000,
        }),
      ),
    ).toBe(true);
  });

  it('hides a dead farewell speaker once the deadline (plus grace) has passed', () => {
    expect(
      shouldShowParticipantMedia(
        args({
          targetIsAlive: false,
          targetSeat: 5,
          farewellSeat: 5,
          phaseDeadline: DEADLINE,
          now: DEADLINE_MS + 5_000,
        }),
      ),
    ).toBe(false);
  });

  it('always shows the viewer their own tile', () => {
    expect(
      shouldShowParticipantMedia(args({ targetUserId: 'viewer', viewerUserId: 'viewer' })),
    ).toBe(true);
  });

  it('lets the judge see every alive player at night', () => {
    expect(shouldShowParticipantMedia(args({ viewerIsJudge: true }))).toBe(true);
  });

  it('lets a dead viewer (spectator) see alive players', () => {
    expect(shouldShowParticipantMedia(args({ viewerIsAlive: false }))).toBe(true);
  });

  it('opens all cameras once the game is finished', () => {
    expect(shouldShowParticipantMedia(args({ status: 'finished' }))).toBe(true);
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.GAME_OVER }))).toBe(true);
  });

  it('shows everyone during introductions and day phases', () => {
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.PLAYER_INTRODUCTION }))).toBe(true);
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.MORNING_ANNOUNCEMENT }))).toBe(true);
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.DAY_SPEECH }))).toBe(true);
  });

  it('on NIGHT_ZERO only the mafia team sees each other', () => {
    const mafiaSeesMafia = args({
      phase: GAME_PHASE.NIGHT_ZERO,
      viewerRole: ROLE.MAFIA,
      targetRole: ROLE.DON,
    });
    expect(shouldShowParticipantMedia(mafiaSeesMafia)).toBe(true);

    const mafiaSeesCivilian = args({
      phase: GAME_PHASE.NIGHT_ZERO,
      viewerRole: ROLE.MAFIA,
      targetRole: ROLE.CIVILIAN,
    });
    expect(shouldShowParticipantMedia(mafiaSeesCivilian)).toBe(false);

    const civilianSeesMafia = args({
      phase: GAME_PHASE.NIGHT_ZERO,
      viewerRole: ROLE.CIVILIAN,
      targetRole: ROLE.MAFIA,
    });
    expect(shouldShowParticipantMedia(civilianSeesMafia)).toBe(false);
  });

  it('shows a dark table to players during ROLE_DISTRIBUTION and regular night phases', () => {
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.ROLE_DISTRIBUTION }))).toBe(false);
    expect(shouldShowParticipantMedia(args({ phase: GAME_PHASE.NIGHT_MAFIA }))).toBe(false);
  });
});

describe('shouldHearParticipantAudio (audio)', () => {
  it('never plays the viewer their own audio (feedback prevention)', () => {
    expect(
      shouldHearParticipantAudio(args({ targetUserId: 'viewer', viewerUserId: 'viewer' })),
    ).toBe(false);
  });

  it('always plays the judge to everyone', () => {
    expect(shouldHearParticipantAudio(args({ targetIsJudge: true }))).toBe(true);
  });

  it('the judge hears everything only when judgeOverhearAll is set', () => {
    // overhear ON: hears an otherwise-silent night player
    expect(shouldHearParticipantAudio(args({ viewerIsJudge: true, judgeOverhearAll: true }))).toBe(
      true,
    );
    // overhear OFF: falls through to the normal pipeline -> silent at night
    expect(shouldHearParticipantAudio(args({ viewerIsJudge: true, judgeOverhearAll: false }))).toBe(
      false,
    );
  });

  it('plays an out-of-turn speaker during the day inside the 5s window', () => {
    expect(
      shouldHearParticipantAudio(
        args({
          phase: GAME_PHASE.DAY_SPEECH,
          targetUserId: 'target',
          outOfTurnSpeaker: { userId: 'target', until: 2_000 },
          now: 1_000,
        }),
      ),
    ).toBe(true);
  });

  it('does not play an out-of-turn speaker once their window has elapsed', () => {
    expect(
      shouldHearParticipantAudio(
        args({
          phase: GAME_PHASE.DAY_SPEECH,
          currentSpeakerSeat: 99, // not this target
          outOfTurnSpeaker: { userId: 'target', until: 500 },
          now: 1_000,
        }),
      ),
    ).toBe(false);
  });

  it('does not honor an out-of-turn window during a night phase', () => {
    expect(
      shouldHearParticipantAudio(
        args({
          phase: GAME_PHASE.NIGHT_MAFIA,
          outOfTurnSpeaker: { userId: 'target', until: 2_000 },
          now: 1_000,
        }),
      ),
    ).toBe(false);
  });

  it('plays a dead farewell speaker until their deadline passes', () => {
    expect(
      shouldHearParticipantAudio(
        args({
          targetIsAlive: false,
          targetSeat: 4,
          farewellSeat: 4,
          phaseDeadline: DEADLINE,
          now: DEADLINE_MS - 1_000,
        }),
      ),
    ).toBe(true);

    expect(
      shouldHearParticipantAudio(
        args({
          targetIsAlive: false,
          targetSeat: 4,
          farewellSeat: 4,
          phaseDeadline: DEADLINE,
          now: DEADLINE_MS + 5_000,
        }),
      ),
    ).toBe(false);
  });

  it('silences other dead players', () => {
    expect(shouldHearParticipantAudio(args({ targetIsAlive: false }))).toBe(false);
  });

  it('lets a dead viewer hear everything', () => {
    expect(shouldHearParticipantAudio(args({ viewerIsAlive: false }))).toBe(true);
  });

  it('opens the mic for everyone once the game is finished', () => {
    expect(shouldHearParticipantAudio(args({ status: 'finished' }))).toBe(true);
    expect(shouldHearParticipantAudio(args({ phase: GAME_PHASE.GAME_OVER }))).toBe(true);
  });

  it('open mic during PLAYER_INTRODUCTION', () => {
    expect(shouldHearParticipantAudio(args({ phase: GAME_PHASE.PLAYER_INTRODUCTION }))).toBe(true);
  });

  it('during the day only the current speaker is audible, and only before the deadline', () => {
    const speaking = args({
      phase: GAME_PHASE.DAY_SPEECH,
      targetSeat: 3,
      currentSpeakerSeat: 3,
      phaseDeadline: DEADLINE,
      now: DEADLINE_MS - 1_000,
    });
    expect(shouldHearParticipantAudio(speaking)).toBe(true);

    const notSpeaker = args({
      phase: GAME_PHASE.DAY_SPEECH,
      targetSeat: 3,
      currentSpeakerSeat: 7,
    });
    expect(shouldHearParticipantAudio(notSpeaker)).toBe(false);

    const expired = args({
      phase: GAME_PHASE.DAY_SPEECH,
      targetSeat: 3,
      currentSpeakerSeat: 3,
      phaseDeadline: DEADLINE,
      now: DEADLINE_MS + 5_000,
    });
    expect(shouldHearParticipantAudio(expired)).toBe(false);
  });

  it('keeps the table silent for players during regular night phases', () => {
    expect(shouldHearParticipantAudio(args({ phase: GAME_PHASE.NIGHT_MAFIA }))).toBe(false);
    expect(shouldHearParticipantAudio(args({ phase: GAME_PHASE.ROLE_DISTRIBUTION }))).toBe(false);
  });
});
