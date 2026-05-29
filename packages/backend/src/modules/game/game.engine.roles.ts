// Role distribution at game start.

import { ROLE, ROLE_COUNTS, type Role } from '@mafia/shared';

import { type GameParticipant } from './game.state.js';

// ---- Role distribution ----

/**
 * Shuffle the seated players' roles in place. Uses Fisher-Yates with crypto-grade randomness
 * so two parallel games cannot ever produce the same role order from a known seed.
 */
// Pre-assigned roles (host's dev affordance) are honored verbatim. Remaining
// players draw from whatever the role pool still has after subtracting the
// pre-assigned ones. The service validates pre-assignment caps; we just
// trust the input here.
export function assignRoles(
  participants: GameParticipant[],
  preassigned: ReadonlyMap<string, Role> = new Map(),
): GameParticipant[] {
  const players = participants.filter((p) => !p.isJudge);

  // Build the remaining role pool by subtracting one role from the configured
  // counts for each pre-assignment.
  const remainingCounts: Record<Role, number> = {
    [ROLE.MAFIA]: ROLE_COUNTS.MAFIA,
    [ROLE.DON]: ROLE_COUNTS.DON,
    [ROLE.SHERIFF]: ROLE_COUNTS.SHERIFF,
    [ROLE.CIVILIAN]: ROLE_COUNTS.CIVILIAN,
  };
  for (const p of players) {
    const fixed = preassigned.get(p.userId);
    if (fixed) remainingCounts[fixed] = Math.max(0, remainingCounts[fixed] - 1);
  }

  const remainingPool: Role[] = [
    ...Array(remainingCounts[ROLE.MAFIA]).fill(ROLE.MAFIA),
    ...Array(remainingCounts[ROLE.DON]).fill(ROLE.DON),
    ...Array(remainingCounts[ROLE.SHERIFF]).fill(ROLE.SHERIFF),
    ...Array(remainingCounts[ROLE.CIVILIAN]).fill(ROLE.CIVILIAN),
  ];

  // Fisher–Yates shuffle the remaining pool with crypto.getRandomValues.
  if (remainingPool.length > 1) {
    const buffer = new Uint32Array(remainingPool.length);
    crypto.getRandomValues(buffer);
    for (let i = remainingPool.length - 1; i > 0; i -= 1) {
      const j = buffer[i]! % (i + 1);
      [remainingPool[i], remainingPool[j]] = [remainingPool[j]!, remainingPool[i]!];
    }
  }

  const withRoles = participants.map((p) => ({ ...p }));
  let poolIdx = 0;
  for (const p of players) {
    const updatedIdx = withRoles.findIndex((w) => w.userId === p.userId);
    const fixed = preassigned.get(p.userId);
    const role = fixed ?? remainingPool[poolIdx++]!;
    withRoles[updatedIdx] = { ...withRoles[updatedIdx]!, role };
  }
  return withRoles;
}
