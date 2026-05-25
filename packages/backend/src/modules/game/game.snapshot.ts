// Snapshot helpers for the judge-revert path.
//
// Когда судья делает REVERT, in-memory snapshot из `historyStacks` восстанавливает
// state до последнего действия. Раньше при крэше бэкенда между revert и
// следующим кликом сервер ловил все события из БД, включая отменённое — и
// REVERTED-событие было no-op'ом в recovery. После рестарта state оказывался
// в pre-revert состоянии. Чтобы recovery воспроизводил revert без in-memory
// истории, REVERTED-событие теперь несёт сериализованный snapshot в payload.
//
// Сериализуем только динамическую часть (фазы, голоса, флаги, per-seat
// alive/foul/removed). Identity участников (nickname, avatarUrl, isBot)
// recovery берёт из БД — это актуальная инфа на момент рестарта, в snapshot
// её не сохраняем чтобы не разойтись с реальностью.
//
// Maps сериализуются как массивы пар (JSON-нативная форма). Daty → ISO-строки.
// JSON-схема — это контракт между write-time (judgeRevert) и read-time
// (recovery): любая правка ломает обратную совместимость снапшотов в логе.

import { GAME_PHASE, type GamePhase, type Role, type Team } from '@mafia/shared';

import type { GameParticipant, GameState } from './game.state.js';
import { INITIAL_PHASE } from './game.state.js';

interface ParticipantDelta {
  userId: string;
  isAlive: boolean;
  isRemoved: boolean;
  foulsCount: number;
  hasSpokenThisDay: boolean;
  role: Role | null;
}

interface BestMoveGuess {
  byUserId: string;
  guessedSeats: number[];
}

interface CheckRecord {
  byUserId: string;
  targetSeat: number;
  result: boolean;
}

interface OutOfTurnSpeaker {
  userId: string;
  until: number;
}

export interface StateSnapshot {
  v: 1;
  phase: GamePhase;
  dayNumber: number;
  phaseStartedAt: string | null;
  phaseDeadline: string | null;
  participantDeltas: ParticipantDelta[];
  currentSpeakerSeat: number | null;
  lastNominatorSeat: number | null;
  nominationSeats: number[];
  votes: [number, number][];
  voteRoundIdx: number;
  mafiaVotes: [number, number][];
  pendingMafiaTargetSeat: number | null;
  sheriffCheck: CheckRecord | null;
  donCheck: CheckRecord | null;
  lastNightVictimSeat: number | null;
  outOfTurnSpeaker: OutOfTurnSpeaker | null;
  farewellSeat: number | null;
  lastWordSeats: number[];
  lastWordIdx: number;
  tiedSeats: number[];
  shootoutSpeakerIdx: number;
  liftAllVotes: [number, boolean][];
  bestMoveGuesses: BestMoveGuess[];
  roleCardPickerSeat: number | null;
  roleCardsPicked: number[];
  disqualifiedThisDay: boolean;
  firstDayMultiVoteKill: boolean;
  winner: Team | null;
}

export function snapshotState(state: GameState): StateSnapshot {
  return {
    v: 1,
    phase: state.phase,
    dayNumber: state.dayNumber,
    phaseStartedAt: state.phaseStartedAt ? state.phaseStartedAt.toISOString() : null,
    phaseDeadline: state.phaseDeadline ? state.phaseDeadline.toISOString() : null,
    participantDeltas: state.participants.map((p) => ({
      userId: p.userId,
      isAlive: p.isAlive,
      isRemoved: p.isRemoved,
      foulsCount: p.foulsCount,
      hasSpokenThisDay: p.hasSpokenThisDay,
      role: p.role,
    })),
    currentSpeakerSeat: state.currentSpeakerSeat,
    lastNominatorSeat: state.lastNominatorSeat,
    nominationSeats: [...state.nominationSeats],
    votes: Array.from(state.votes.entries()),
    voteRoundIdx: state.voteRoundIdx,
    mafiaVotes: Array.from(state.mafiaVotes.entries()),
    pendingMafiaTargetSeat: state.pendingMafiaTargetSeat,
    sheriffCheck: state.sheriffCheck ? { ...state.sheriffCheck } : null,
    donCheck: state.donCheck ? { ...state.donCheck } : null,
    lastNightVictimSeat: state.lastNightVictimSeat,
    outOfTurnSpeaker: state.outOfTurnSpeaker ? { ...state.outOfTurnSpeaker } : null,
    farewellSeat: state.farewellSeat,
    lastWordSeats: [...state.lastWordSeats],
    lastWordIdx: state.lastWordIdx,
    tiedSeats: [...state.tiedSeats],
    shootoutSpeakerIdx: state.shootoutSpeakerIdx,
    liftAllVotes: Array.from(state.liftAllVotes.entries()),
    bestMoveGuesses: state.bestMoveGuesses.map((g) => ({
      byUserId: g.byUserId,
      guessedSeats: [...g.guessedSeats],
    })),
    roleCardPickerSeat: state.roleCardPickerSeat,
    roleCardsPicked: [...state.roleCardsPicked],
    disqualifiedThisDay: state.disqualifiedThisDay,
    firstDayMultiVoteKill: state.firstDayMultiVoteKill,
    winner: state.winner,
  };
}

// Узкий парсер payload'а REVERTED. Возвращает null, если форма не подходит —
// recovery в этом случае просто игнорирует событие, и state остаётся как
// есть. Не throw'аем, чтобы один битый event не повалил весь boot.
export function parseSnapshot(raw: unknown): StateSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;

  // Тонкая валидация: только проверка, что обязательные поля присутствуют и
  // имеют правильный тип на верхнем уровне. Глубокую проверку каждого узла
  // не делаем — снапшот пишем мы сами через snapshotState(), доверяемся
  // источнику но не падаем при первом неожиданном поле.
  const ok =
    typeof o.phase === 'string' &&
    typeof o.dayNumber === 'number' &&
    (o.phaseStartedAt === null || typeof o.phaseStartedAt === 'string') &&
    (o.phaseDeadline === null || typeof o.phaseDeadline === 'string') &&
    Array.isArray(o.participantDeltas) &&
    Array.isArray(o.nominationSeats) &&
    Array.isArray(o.votes) &&
    typeof o.voteRoundIdx === 'number' &&
    Array.isArray(o.mafiaVotes) &&
    Array.isArray(o.lastWordSeats) &&
    typeof o.lastWordIdx === 'number' &&
    Array.isArray(o.tiedSeats) &&
    typeof o.shootoutSpeakerIdx === 'number' &&
    Array.isArray(o.liftAllVotes) &&
    Array.isArray(o.bestMoveGuesses) &&
    Array.isArray(o.roleCardsPicked) &&
    typeof o.disqualifiedThisDay === 'boolean' &&
    typeof o.firstDayMultiVoteKill === 'boolean';
  if (!ok) return null;
  return o as unknown as StateSnapshot;
}

// Накатить snapshot на текущий state. Identity участников (nickname, avatar,
// isBot, isJudge, seat) берём из текущих participants — они могли быть
// обновлены пока судья сидел в pre-revert состоянии. Снапшот переписывает
// только динамику.
export function restoreFromSnapshot(
  snapshot: StateSnapshot,
  identity: GameParticipant[],
): GameState {
  const deltaByUser = new Map(snapshot.participantDeltas.map((d) => [d.userId, d]));
  const mergedParticipants: GameParticipant[] = identity.map((p) => {
    const d = deltaByUser.get(p.userId);
    if (!d) return p;
    return {
      ...p,
      isAlive: d.isAlive,
      isRemoved: d.isRemoved,
      foulsCount: d.foulsCount,
      hasSpokenThisDay: d.hasSpokenThisDay,
      // role в snapshot — для случая, когда revert откатил до момента когда
      // роли ещё не были распределены, или наоборот.
      role: d.role,
    };
  });

  return {
    id: '',
    lobbyId: '',
    rulesetSlug: '',
    status: 'in_progress',
    phase: snapshot.phase ?? INITIAL_PHASE,
    dayNumber: snapshot.dayNumber,
    phaseStartedAt: snapshot.phaseStartedAt ? new Date(snapshot.phaseStartedAt) : null,
    phaseDeadline: snapshot.phaseDeadline ? new Date(snapshot.phaseDeadline) : null,
    participants: mergedParticipants,
    currentSpeakerSeat: snapshot.currentSpeakerSeat,
    lastNominatorSeat: snapshot.lastNominatorSeat,
    nominationSeats: snapshot.nominationSeats,
    votes: new Map(snapshot.votes),
    voteRoundIdx: snapshot.voteRoundIdx,
    mafiaVotes: new Map(snapshot.mafiaVotes),
    pendingMafiaTargetSeat: snapshot.pendingMafiaTargetSeat,
    sheriffCheck: snapshot.sheriffCheck,
    donCheck: snapshot.donCheck,
    lastNightVictimSeat: snapshot.lastNightVictimSeat,
    outOfTurnSpeaker: snapshot.outOfTurnSpeaker,
    farewellSeat: snapshot.farewellSeat,
    lastWordSeats: snapshot.lastWordSeats,
    lastWordIdx: snapshot.lastWordIdx,
    tiedSeats: snapshot.tiedSeats,
    shootoutSpeakerIdx: snapshot.shootoutSpeakerIdx,
    liftAllVotes: new Map(snapshot.liftAllVotes),
    bestMoveGuesses: snapshot.bestMoveGuesses,
    roleCardPickerSeat: snapshot.roleCardPickerSeat,
    roleCardsPicked: snapshot.roleCardsPicked,
    disqualifiedThisDay: snapshot.disqualifiedThisDay,
    firstDayMultiVoteKill: snapshot.firstDayMultiVoteKill,
    winner: snapshot.winner,
    nextEventSeq: 0,
  };
}

// Используется в recovery: применить snapshot к существующему state,
// сохраняя identity (id/lobbyId/rulesetSlug/participants identity) от
// уже-построенного state. Возвращает новый объект.
export function applySnapshotToState(state: GameState, snapshot: StateSnapshot): GameState {
  const restored = restoreFromSnapshot(snapshot, state.participants);
  return {
    ...restored,
    id: state.id,
    lobbyId: state.lobbyId,
    rulesetSlug: state.rulesetSlug,
    // nextEventSeq оставляем как был — он отслеживается отдельно в replayState.
    nextEventSeq: state.nextEventSeq,
  };
}

// Type-tag for tests / future serializers.
export const SNAPSHOT_VERSION = 1 as const;
// Re-export for tests that need to inspect a specific phase constant.
export { GAME_PHASE };
