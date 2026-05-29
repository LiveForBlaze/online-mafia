// Pure functions that drive game state forward.
//
// All functions here are intentionally side-effect-free — they take a state and inputs,
// return a new state (or an error). Persistence and broadcasting live in game.service.ts;
// keeping the engine pure makes it trivially testable and avoids accidental ordering bugs.
//
// This file is a barrel. The implementation is split across cohesive sibling
// modules (shared primitives, role assignment, voting, night actions, phase
// transitions, judge discipline, projection). Every public symbol that used
// to live here is re-exported below so importers keep using './game.engine.js'
// unchanged.

export {
  ENGINE_ERROR,
  checkWinner,
  withFreshDeadline,
  type EngineErrorCode,
  type EngineResult,
} from './game.engine.shared.js';

export { assignRoles } from './game.engine.roles.js';

export {
  applyBestMoveGuess,
  applyCastVote,
  applyJudgeUnnominate,
  applyLiftAllVote,
  applyNominate,
  findTiedSeats,
  nextSpeakerSeat,
  resolveVote,
} from './game.engine.voting.js';

export {
  applyDonCheck,
  applyMafiaTarget,
  applyRoleCardPick,
  applySheriffCheck,
} from './game.engine.night.js';

export { applyAdvancePhase, nextPhase } from './game.engine.phase.js';

export { applyNextSpeaker } from './game.engine.speaker.js';

export {
  OUT_OF_TURN_WINDOW_MS,
  applyJudgeEndGame,
  applyJudgeFoul,
  applyJudgeRemove,
  applyJudgeUnfoul,
  applyOutOfTurn,
} from './game.engine.judge.js';

export { projectFor } from './game.engine.projection.js';
