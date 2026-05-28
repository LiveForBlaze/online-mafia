// Socket.IO event handlers for the game module.
//
// Responsibilities:
//   - Register socket handlers for player and judge actions
//   - Validate payloads with zod
//   - Delegate to the service layer for business logic
//   - Broadcast a fresh, role-projected state to every socket in the game room
//
// Per-user projection means we cannot simply `io.to(room).emit(state)` — each member
// must receive their own filtered view. We iterate sockets in the room instead.

import type { FastifyInstance } from 'fastify';
import type { Socket } from 'socket.io';
import {
  BAN_RESTRICTION,
  CLIENT_EVENT,
  SERVER_EVENT,
  bestMoveGuessPayloadSchema,
  castVotePayloadSchema,
  clientDiagPayloadSchema,
  donCheckPayloadSchema,
  judgeFoulPayloadSchema,
  judgeRemovePayloadSchema,
  liftAllVotePayloadSchema,
  mafiaTargetPayloadSchema,
  nominatePayloadSchema,
  roleCardPickPayloadSchema,
  sheriffCheckPayloadSchema,
} from '@mafia/shared';
import { z } from 'zod';

import { appendDebugLog } from '../../lib/debug-log.js';
import { logger } from '../../lib/logger.js';
import { socketHasRestriction } from '../../plugins/socketio.js';

import { attachIO, broadcastGameState, gameRoomName } from './game.broadcast.js';
import { projectFor } from './game.engine.js';
import { getGame } from './game.registry.js';
import {
  castBestMoveGuess,
  castLiftAllVote,
  castVote,
  checkAsDon,
  checkAsSheriff,
  chooseMafiaTarget,
  isParticipant,
  judgeAdvancePhase,
  judgeAdvanceSpeaker,
  judgeIssueFoul,
  judgeRevert,
  judgeRevokeFoul,
  judgeRemovePlayer,
  judgeUnnominate,
  leaveGameAsParticipant,
  nominatePlayer,
  pickRoleCard,
  sayOutOfTurn,
  type ServiceResult,
} from './game.service.js';

const joinGamePayloadSchema = z.object({
  gameId: z.string().uuid(),
});

// Custom Socket.IO event names used only by the game module. Naming kept consistent
// with the existing prefixes (client:* / server:*) declared in @mafia/shared.
const GAME_EVENT_NAME = {
  JOIN: 'client:game_join',
  ADVANCE_PHASE: 'client:judge_advance_phase',
  ADVANCE_SPEAKER: 'client:judge_advance_speaker',
} as const;

export function registerGameGateway(app: FastifyInstance): void {
  const io = app.io;
  // Share the io instance with anything that needs to broadcast outside of a socket
  // handler (e.g. the bot AI).
  attachIO(io);

  io.on('connection', (socket) => {
    const userId = socket.data.user.sub;

    socket.on(GAME_EVENT_NAME.JOIN, async (payload, ack) => {
      const parsed = joinGamePayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      // Просмотр live-партий гейчится отдельно от participation — если у
      // юзера VIEW_GAMES, он вообще не должен видеть state, даже как игрок.
      if (socketHasRestriction(socket, BAN_RESTRICTION.VIEW_GAMES)) {
        ack?.({ ok: false, error: 'banned' });
        return;
      }
      if (!isParticipant(parsed.data.gameId, userId)) {
        ack?.({ ok: false, error: 'not_participant' });
        return;
      }
      // The client keeps a single socket alive across pages (lobby ↔ game), so a
      // player jumping between games could otherwise stay subscribed to the old
      // room and receive its broadcasts after switching. Leave every other game
      // room first.
      const targetRoom = gameRoomName(parsed.data.gameId);
      for (const room of socket.rooms) {
        if (room.startsWith('game:') && room !== targetRoom) {
          await socket.leave(room);
        }
      }
      await socket.join(targetRoom);
      const state = getGame(parsed.data.gameId);
      if (state) {
        socket.emit(SERVER_EVENT.GAME_STATE_DELTA, projectFor(state, userId));
      }
      logger.info(
        {
          diag: 'ws.game.join',
          gameId: parsed.data.gameId,
          userId,
          nickname: socket.data.user?.nickname,
          socketId: socket.id,
          deliveredInitialState: Boolean(state),
          phase: state?.phase ?? null,
        },
        'diag GAME_JOIN ok',
      );
      void appendDebugLog(parsed.data.gameId, {
        cat: 'socket',
        type: 'game.join',
        actor: socket.data.user?.nickname ?? null,
        userId,
        data: {
          socketId: socket.id,
          deliveredInitialState: Boolean(state),
          phase: state?.phase ?? null,
        },
      });
      ack?.({ ok: true });
    });

    // Игровые мутации блокируются если у юзера PARTICIPATE_GAMES бан —
    // даже если socket был открыт до бана. HTTP-роуты уже защищены
    // app.requireRestrictionNotSet; гейт для socket-канала встроен в
    // withSchema + inline-проверки ниже для handler'ов без withSchema.
    const guardParticipation = (ack?: (response: unknown) => void): boolean => {
      if (socketHasRestriction(socket, BAN_RESTRICTION.PARTICIPATE_GAMES)) {
        ack?.({ ok: false, error: 'banned' });
        return false;
      }
      return true;
    };

    // Player actions
    socket.on(
      CLIENT_EVENT.NOMINATE_PLAYER,
      withSchema(socket, nominatePayloadSchema, (data) =>
        nominatePlayer({ gameId: getGameIdFromSocket(socket), userId }, data.targetSeat),
      ),
    );
    socket.on(
      CLIENT_EVENT.UNNOMINATE_PLAYER,
      withSchema(socket, nominatePayloadSchema, (data) =>
        judgeUnnominate({ gameId: getGameIdFromSocket(socket), userId }, data.targetSeat),
      ),
    );
    socket.on(CLIENT_EVENT.CLIENT_DIAG, (payload, ack) => {
      const parsed = clientDiagPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'invalid_payload' });
        return;
      }
      const gameRoom = [...socket.rooms].find((r) => r.startsWith('game:'));
      const gameId = gameRoom ? gameRoom.slice('game:'.length) : null;
      void appendDebugLog(gameId, {
        cat: 'client',
        type: parsed.data.type,
        actor: socket.data.user?.nickname ?? null,
        userId,
        data: parsed.data.data,
      });
      ack?.({ ok: true });
    });
    socket.on(
      CLIENT_EVENT.CAST_VOTE,
      withSchema(socket, castVotePayloadSchema, (data) =>
        castVote({ gameId: getGameIdFromSocket(socket), userId }, data.candidateSeat),
      ),
    );
    socket.on(
      CLIENT_EVENT.MAFIA_TARGET,
      withSchema(socket, mafiaTargetPayloadSchema, (data) =>
        chooseMafiaTarget({ gameId: getGameIdFromSocket(socket), userId }, data.targetSeat),
      ),
    );
    socket.on(
      CLIENT_EVENT.DON_CHECK,
      withSchema(socket, donCheckPayloadSchema, (data) =>
        checkAsDon({ gameId: getGameIdFromSocket(socket), userId }, data.targetSeat),
      ),
    );
    socket.on(
      CLIENT_EVENT.SHERIFF_CHECK,
      withSchema(socket, sheriffCheckPayloadSchema, (data) =>
        checkAsSheriff({ gameId: getGameIdFromSocket(socket), userId }, data.targetSeat),
      ),
    );
    socket.on(
      CLIENT_EVENT.ROLE_CARD_PICK,
      withSchema(socket, roleCardPickPayloadSchema, (data) =>
        pickRoleCard({ gameId: getGameIdFromSocket(socket), userId }, data.cardIndex),
      ),
    );

    // Judge actions
    socket.on(GAME_EVENT_NAME.ADVANCE_PHASE, async (_payload, ack) => {
      if (!guardParticipation(ack)) return;
      const gameId = getGameIdFromSocket(socket);
      if (!gameId) {
        ack?.({ ok: false, error: 'not_in_game' });
        return;
      }
      const result = await judgeAdvancePhase({ gameId, userId });
      respondAndBroadcast(gameId, result, ack);
    });
    socket.on(CLIENT_EVENT.JUDGE_REVERT, async (_payload, ack) => {
      if (!guardParticipation(ack)) return;
      const gameId = getGameIdFromSocket(socket);
      if (!gameId) {
        ack?.({ ok: false, error: 'no_game' });
        return;
      }
      const result = await judgeRevert({ gameId, userId });
      respondAndBroadcast(gameId, result, ack);
    });
    socket.on(GAME_EVENT_NAME.ADVANCE_SPEAKER, async (_payload, ack) => {
      if (!guardParticipation(ack)) return;
      const gameId = getGameIdFromSocket(socket);
      if (!gameId) {
        ack?.({ ok: false, error: 'not_in_game' });
        return;
      }
      const result = await judgeAdvanceSpeaker({ gameId, userId });
      respondAndBroadcast(gameId, result, ack);
    });
    socket.on(
      CLIENT_EVENT.JUDGE_ISSUE_FOUL,
      withSchema(socket, judgeFoulPayloadSchema, (data) =>
        judgeIssueFoul({ gameId: getGameIdFromSocket(socket), userId }, data.targetUserId),
      ),
    );
    socket.on(
      CLIENT_EVENT.JUDGE_REVOKE_FOUL,
      withSchema(socket, judgeFoulPayloadSchema, (data) =>
        judgeRevokeFoul({ gameId: getGameIdFromSocket(socket), userId }, data.targetUserId),
      ),
    );
    socket.on(
      CLIENT_EVENT.JUDGE_REMOVE_PLAYER,
      withSchema(socket, judgeRemovePayloadSchema, (data) =>
        judgeRemovePlayer({ gameId: getGameIdFromSocket(socket), userId }, data.targetUserId),
      ),
    );

    socket.on(
      CLIENT_EVENT.BEST_MOVE_GUESS,
      withSchema(socket, bestMoveGuessPayloadSchema, (data) =>
        castBestMoveGuess({ gameId: getGameIdFromSocket(socket), userId }, data.guessedSeats),
      ),
    );

    socket.on(
      CLIENT_EVENT.LIFT_ALL_VOTE,
      withSchema(socket, liftAllVotePayloadSchema, (data) =>
        castLiftAllVote({ gameId: getGameIdFromSocket(socket), userId }, data.yes),
      ),
    );

    socket.on(CLIENT_EVENT.SAY_OUT_OF_TURN, async (_payload, ack) => {
      if (!guardParticipation(ack)) return;
      const gameId = getGameIdFromSocket(socket);
      if (!gameId) {
        ack?.({ ok: false, error: 'not_in_game' });
        return;
      }
      const result = await sayOutOfTurn({ gameId, userId });
      respondAndBroadcast(gameId, result, ack);
    });

    // The player presses the red "Выйти из игры" button. No payload — they remove
    // themselves. Same effect as the judge removing them. Этот action НЕ
    // гейчим под participate_games — забанённый игрок наоборот должен иметь
    // возможность выйти из игры в которой случайно остался.
    socket.on(CLIENT_EVENT.LEAVE_GAME, async (_payload, ack) => {
      const gameId = getGameIdFromSocket(socket);
      if (!gameId) {
        ack?.({ ok: false, error: 'not_in_game' });
        return;
      }
      const result = await leaveGameAsParticipant({ gameId, userId });
      respondAndBroadcast(gameId, result, ack);
    });
  });
}

// ---- Helpers ----

/** Each socket can be in at most one game room — return that room's gameId, if any. */
function getGameIdFromSocket(socket: Socket): string {
  for (const room of socket.rooms) {
    if (room.startsWith('game:')) return room.slice('game:'.length);
  }
  return '';
}

/**
 * Wrap a service-call factory so the handler:
 *   - validates the payload with a zod schema
 *   - rejects malformed payloads via ack
 *   - calls the service and broadcasts the resulting state to the room
 */
function withSchema<T>(
  socket: Socket,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  invoke: (data: T) => Promise<ServiceResult<unknown>>,
) {
  return async (payload: unknown, ack?: (response: unknown) => void) => {
    // PARTICIPATE_GAMES бан перекрывает все мутирующие game-actions через
    // socket (HTTP-роуты гейчатся отдельно через app.requireRestrictionNotSet).
    if (socketHasRestriction(socket, BAN_RESTRICTION.PARTICIPATE_GAMES)) {
      ack?.({ ok: false, error: 'banned' });
      return;
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }
    const gameId = getGameIdFromSocket(socket);
    if (!gameId) {
      ack?.({ ok: false, error: 'not_in_game' });
      return;
    }
    const result = await invoke(parsed.data);
    respondAndBroadcast(gameId, result, ack);
  };
}

function respondAndBroadcast(
  gameId: string,
  result: ServiceResult<unknown>,
  ack: ((response: unknown) => void) | undefined,
): void {
  if (!result.ok) {
    ack?.({ ok: false, error: result.error });
    return;
  }
  ack?.({ ok: true });
  broadcastGameState(gameId);
}
