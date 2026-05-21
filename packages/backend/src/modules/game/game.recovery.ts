// Recovers in-flight games from the event log on backend startup.
//
// The in-memory `game.registry` is volatile — every backend restart wipes it.
// But every state-changing action of every game has been persisted to GameEvent.
// On startup we:
//   1. Find every Game row with endedAt = NULL (i.e. still in progress)
//   2. For each, load its participants (with role / alive / fouls already on disk)
//   3. Replay every GameEvent in seq order through the same engine functions used
//      to mutate state at runtime — landing the in-memory state where the crash
//      interrupted it
//   4. Re-register in the registry; sync LiveKit permissions so when clients
//      reconnect they get the right canPublish for the current phase

import type { Prisma } from '@prisma/client';
import { type Role } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';

import {
  applyAdvancePhase,
  applyBestMoveGuess,
  applyCastVote,
  applyDonCheck,
  applyJudgeFoul,
  applyJudgeRemove,
  applyMafiaTarget,
  applyNextSpeaker,
  applyNominate,
  applySheriffCheck,
} from './game.engine.js';
import { syncMediaPermissions } from './game.media-permissions.js';
import { registerGame } from './game.registry.js';
import { GAME_EVENT_TYPE } from './game.service.js';
import { INITIAL_PHASE, type GameParticipant, type GameState } from './game.state.js';

interface EventLike {
  seq: number;
  type: string;
  actorId: string | null;
  payload: Prisma.JsonValue;
}

/** Walk all in-progress games and reload them into the in-memory registry. */
export async function recoverActiveGames(): Promise<void> {
  const games = await prisma.game.findMany({
    where: { endedAt: null },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, nickname: true, publicCode: true, avatarUrl: true, isBot: true },
          },
        },
      },
    },
  });

  await Promise.all(
    games.map(async (game) => {
      const events = await prisma.gameEvent.findMany({
        where: { gameId: game.id },
        orderBy: { seq: 'asc' },
        select: { seq: true, type: true, actorId: true, payload: true },
      });

      const state = replayState(
        {
          id: game.id,
          lobbyId: game.lobbyId,
          rulesetSlug: game.rulesetSlug,
        },
        game.participants.map((p) => ({
          userId: p.userId,
          nickname: p.user.nickname,
          publicCode: p.user.publicCode,
          avatarUrl: p.user.avatarUrl,
          seat: p.seat,
          isJudge: p.isJudge,
          isBot: p.user.isBot,
          // Roles on disk are authoritative — assignment happened in createGameFromLobby
          // and is never changed afterwards.
          role: p.role as Role | null,
          // isAlive / isRemoved / foulsCount get rebuilt by replaying the events below.
          isAlive: true,
          isRemoved: false,
          foulsCount: 0,
          hasSpokenThisDay: false,
        })),
        events,
      );

      if (state.status === 'finished') return;
      registerGame(state);
      void syncMediaPermissions(state);
    }),
  );
}

/** Build an initial blank state and replay events into it. */
function replayState(
  identity: { id: string; lobbyId: string; rulesetSlug: string },
  participants: GameParticipant[],
  events: EventLike[],
): GameState {
  let state: GameState = {
    id: identity.id,
    lobbyId: identity.lobbyId,
    rulesetSlug: identity.rulesetSlug,
    status: 'in_progress',
    phase: INITIAL_PHASE,
    dayNumber: 0,
    phaseStartedAt: null,
    phaseDeadline: null,
    participants,
    currentSpeakerSeat: null,
    nominationSeats: [],
    votes: new Map(),
    mafiaVotes: new Map(),
    pendingMafiaTargetSeat: null,
    sheriffCheck: null,
    donCheck: null,
    lastNightVictimSeat: null,
    outOfTurnSpeaker: null,
    farewellSeat: null,
    lastWordSeats: [],
    lastWordIdx: 0,
    tiedSeats: [],
    shootoutSpeakerIdx: 0,
    bestMoveGuesses: [],
    winner: null,
    nextEventSeq: 0,
  };

  for (const event of events) {
    state = applyEvent(state, event);
    state.nextEventSeq = event.seq + 1;
  }
  return state;
}

/**
 * Dispatch a single recorded event to the engine function that originally produced it.
 * The engine validates "can this happen now?" — if validation fails during replay,
 * we ignore the event and keep going. That can happen if past code emitted an event
 * that no longer matches current engine rules; we'd rather resume than fail the boot.
 */
function applyEvent(state: GameState, event: EventLike): GameState {
  switch (event.type) {
    case GAME_EVENT_TYPE.GAME_CREATED:
      return state;

    case GAME_EVENT_TYPE.PHASE_CHANGED:
      return applyAdvancePhase(state);

    case GAME_EVENT_TYPE.SPEAKER_ADVANCED: {
      const { state: advanced } = applyNextSpeaker(state);
      return advanced;
    }

    case GAME_EVENT_TYPE.PLAYER_NOMINATED: {
      const seat = extractSeat(event.payload, 'targetSeat');
      if (!event.actorId || seat === null) return state;
      const r = applyNominate(state, event.actorId, seat);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.PLAYER_VOTED: {
      const seat = extractSeat(event.payload, 'candidateSeat');
      if (!event.actorId || seat === null) return state;
      const r = applyCastVote(state, event.actorId, seat);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.MAFIA_TARGETED: {
      const seat = extractSeat(event.payload, 'targetSeat');
      if (!event.actorId || seat === null) return state;
      const r = applyMafiaTarget(state, event.actorId, seat);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.DON_CHECKED: {
      const seat = extractSeat(event.payload, 'targetSeat');
      if (!event.actorId || seat === null) return state;
      const r = applyDonCheck(state, event.actorId, seat);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.SHERIFF_CHECKED: {
      const seat = extractSeat(event.payload, 'targetSeat');
      if (!event.actorId || seat === null) return state;
      const r = applySheriffCheck(state, event.actorId, seat);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.FOUL_ISSUED: {
      const targetUserId = extractString(event.payload, 'targetUserId');
      if (!targetUserId) return state;
      const r = applyJudgeFoul(state, targetUserId);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.PLAYER_REMOVED: {
      const targetUserId = extractString(event.payload, 'targetUserId');
      if (!targetUserId) return state;
      const r = applyJudgeRemove(state, targetUserId);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.BEST_MOVE_GUESSED: {
      if (!event.actorId) return state;
      const seats = extractSeatList(event.payload, 'guessedSeats');
      if (seats.length === 0) return state;
      const r = applyBestMoveGuess(state, event.actorId, seats);
      return r.ok ? r.data : state;
    }

    case GAME_EVENT_TYPE.GAME_ENDED:
      // The winning team and the `finished` status were already set by the
      // phase transition that ended the game; this event is purely audit.
      return state;

    default:
      return state;
  }
}

function extractSeat(payload: Prisma.JsonValue, field: string): number | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === 'number') return value;
  }
  return null;
}

function extractSeatList(payload: Prisma.JsonValue, field: string): number[] {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[field];
    if (Array.isArray(value)) {
      return value.filter((v): v is number => typeof v === 'number');
    }
  }
  return [];
}

function extractString(payload: Prisma.JsonValue, field: string): string | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === 'string') return value;
  }
  return null;
}
