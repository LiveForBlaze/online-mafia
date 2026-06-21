// Game lifecycle — starting a game from a lobby and locating a user's
// in-progress game.

import { LOBBY, ROLE, type Role } from '@mafia/shared';

import { prisma } from '../../db/prisma.client.js';
import { withLock } from '../../lib/mutex.js';
import { broadcastLobbyUpdate } from '../lobby/lobby.broadcast.js';
import { isUniqueConstraintViolation } from '../lobby/lobby.service.internal.js';
import { assignRoles } from './game.engine.js';
import { withFreshDeadline } from './game.engine.js';
import { GAME_ERROR } from './game.errors.js';
import { getGame, registerGame } from './game.registry.js';
import { syncMediaPermissions } from './game.media-permissions.js';
import { INITIAL_PHASE, findByUserId, type GameParticipant, type GameState } from './game.state.js';
import { GAME_EVENT_TYPE, ok, fail, type ServiceResult } from './game.service.internal.js';

// ---- Lifecycle: start game from lobby ----

export async function createGameFromLobby(
  lobbyId: string,
  requesterUserId: string,
): Promise<ServiceResult<{ gameId: string }>> {
  // Serialise concurrent starts on the same lobby — без лока двойное нажатие
  // «Начать» проходит check-then-create обоими, и проигравший упирается в
  // P2002 на Game.lobbyId (@unique), который без catch улетает сырым 500.
  return withLock(lobbyId, () => createGameFromLobbyLocked(lobbyId, requesterUserId));
}

async function createGameFromLobbyLocked(
  lobbyId: string,
  requesterUserId: string,
): Promise<ServiceResult<{ gameId: string }>> {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: {
      members: { include: { user: true } },
      game: { select: { id: true } },
    },
  });
  if (!lobby) return fail(GAME_ERROR.LOBBY_NOT_FOUND);
  if (lobby.hostId !== requesterUserId) return fail(GAME_ERROR.NOT_LOBBY_HOST);
  if (lobby.game) return fail(GAME_ERROR.LOBBY_ALREADY_STARTED);
  if (lobby.status !== 'WAITING') return fail(GAME_ERROR.LOBBY_ALREADY_STARTED);
  if (lobby.members.length !== LOBBY.MAX_MEMBERS) return fail(GAME_ERROR.LOBBY_NOT_READY);

  const judge = lobby.members.find((m) => m.isJudge);
  if (!judge) return fail(GAME_ERROR.LOBBY_NOT_READY);
  // Every PLAYER must have flipped "Готов" — judge is the one starting and
  // doesn't toggle ready. Bots are seeded ready=true so they never block.
  if (!lobby.members.every((m) => m.isJudge || m.isReady)) {
    return fail(GAME_ERROR.LOBBY_NOT_READY);
  }

  const initialParticipants: GameParticipant[] = lobby.members.map((m) => ({
    userId: m.user.id,
    nickname: m.user.nickname,
    publicCode: m.user.publicCode,
    avatarUrl: m.user.avatarUrl,
    seat: m.seat,
    isJudge: m.isJudge,
    isBot: m.user.isBot,
    role: null,
    isAlive: true,
    isRemoved: false,
    foulsCount: 0,
    hasSpokenThisDay: false,
  }));

  // Host's dev pre-assignments — engine uses these verbatim and randomizes
  // only the remaining seats. Unknown values are ignored (defensive).
  const KNOWN_ROLES: ReadonlySet<string> = new Set([
    ROLE.CIVILIAN,
    ROLE.SHERIFF,
    ROLE.MAFIA,
    ROLE.DON,
  ]);
  const preassigned = new Map<string, Role>();
  for (const m of lobby.members) {
    if (m.isJudge || !m.preassignedRole) continue;
    if (KNOWN_ROLES.has(m.preassignedRole)) {
      preassigned.set(m.user.id, m.preassignedRole as Role);
    }
  }

  const withRoles = assignRoles(initialParticipants, preassigned);

  // Persist Game + GameParticipants + initial event in one transaction.
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const game = await tx.game.create({
        data: {
          lobbyId: lobby.id,
          rulesetSlug: lobby.rulesetSlug,
        },
      });
      await tx.gameParticipant.createMany({
        data: withRoles.map((p) => ({
          gameId: game.id,
          userId: p.userId,
          seat: p.seat,
          isJudge: p.isJudge,
          role: p.role,
        })),
      });
      await tx.lobby.update({
        where: { id: lobby.id },
        data: { status: 'IN_GAME' },
      });
      await tx.gameEvent.create({
        data: {
          gameId: game.id,
          seq: 0,
          phase: INITIAL_PHASE,
          type: GAME_EVENT_TYPE.GAME_CREATED,
          payload: { lobbyId: lobby.id, rulesetSlug: lobby.rulesetSlug },
        },
      });
      return game;
    });
  } catch (error) {
    // Game.lobbyId is @unique — a concurrent start that won the race already
    // created the game. Treat the loser's P2002 as «уже стартовало», same as
    // the lobby.game guard above, instead of surfacing a raw 500.
    if (isUniqueConstraintViolation(error)) return fail(GAME_ERROR.LOBBY_ALREADY_STARTED);
    throw error;
  }

  const baseState: GameState = {
    id: created.id,
    lobbyId: lobby.id,
    rulesetSlug: lobby.rulesetSlug,
    status: 'in_progress',
    phase: INITIAL_PHASE,
    dayNumber: 0,
    phaseStartedAt: null,
    phaseDeadline: null,
    participants: withRoles,
    currentSpeakerSeat: null,
    lastNominatorSeat: null,
    nominationSeats: [],
    votes: new Map(),
    voteRoundIdx: 0,
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
    liftAllVotes: new Map(),
    bestMoveGuesses: [],
    roleCardPickerSeat: null,
    roleCardsPicked: [],
    disqualifiedThisDay: false,
    firstDayMultiVoteKill: false,
    winner: null,
    nextEventSeq: 1,
  };
  const state = withFreshDeadline(baseState, INITIAL_PHASE);
  registerGame(state);

  // Set initial LiveKit publish permissions for everyone. Most participants probably
  // haven't joined the LiveKit room yet at this moment — the call will succeed for
  // any who have, and silently no-op for the rest. The next phase-advance will catch
  // anyone who joined late.
  void syncMediaPermissions(state);

  // Push the updated lobby (with the new gameId attached) to every lobby socket
  // so non-host players are redirected to /game/:id immediately. Without this,
  // they have to wait for the next polling refetch — felt like a long delay
  // compared to the host's instant navigation.
  void broadcastLobbyUpdate(lobby.id);

  return ok({ gameId: created.id });
}

// Returns the gameId of the user's currently-running game where they are still
// considered an active participant (not isRemoved). Used by the client to
// auto-redirect a returning user back into their in-progress game when they
// land on the home page after a connection drop or page refresh.
//
// Note: dead players (isAlive=false) are still considered "active" here — they
// should remain in the room to watch the rest of the game. Only an explicit
// "Выйти из игры" press (which sets isRemoved=true) removes them entirely.
export async function findUserActiveGameId(userId: string): Promise<string | null> {
  const candidates = await prisma.game.findMany({
    where: {
      endedAt: null,
      participants: { some: { userId } },
    },
    select: { id: true },
    orderBy: { startedAt: 'desc' },
  });

  for (const { id } of candidates) {
    const state = getGame(id);
    if (!state) continue;
    if (state.status === 'finished') continue;
    const participant = findByUserId(state, userId);
    if (participant && !participant.isRemoved) return id;
  }
  return null;
}
