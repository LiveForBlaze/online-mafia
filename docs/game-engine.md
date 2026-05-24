# Game engine

The engine implements classic 10-player sport mafia according to **ФИИМ**
(Federation of International Intellectual Mafia) tournament rules.

This is the single most complex piece of the codebase. Everything else is
plumbing around it. The engine is **pure**: every action is
`(state, input) → { state | error }`, no IO, no side effects. Side effects
(DB events, broadcasts, LiveKit permission flips) live in
`game.service.ts` on top.

## Roles & teams

| Role     | Count | Team  |
| -------- | ----- | ----- |
| Civilian | 6     | Red   |
| Sheriff  | 1     | Red   |
| Mafia    | 2     | Black |
| Don      | 1     | Black |

Win conditions (`checkWinner`):

- **Red wins** when every black player is dead.
- **Black wins** when `aliveBlack >= aliveRed`.

## Phase FSM

The full state machine (every transition is in `nextPhase()` /
`applyAdvancePhase()` in `game.engine.ts`):

```
LOBBY (lobby module, not engine)
  ↓
PLAYER_INTRODUCTION  ← open mic, players say hi
  ↓
ROLE_DISTRIBUTION    ← each player clicks a face-down card in seat order
  ↓
NIGHT_ZERO           ← mafia + don meet (no kill)
  ↓
DAY_SPEECH ──┐
  ↓          │ (no nominations / day-1 single nominee / disqualification)
DAY_VOTE_INTRO ── (day-1 single → NIGHT_MAFIA, skipping the vote)
  ↓
DAY_VOTE                        ──┐
  ↓                               │
  ├─ winner   → DAY_LAST_WORD     │
  ├─ tie 2+   → DAY_SHOOTOUT      │
  │             ↓                 │
  │             DAY_REVOTE        │
  │             ↓                 │
  │             ├─ winner → DAY_LAST_WORD
  │             ├─ tie    → DAY_LIFT_VOTE
  │             │            ↓
  │             │            ├─ pass  → DAY_LAST_WORD (multi-victim queue)
  │             │            └─ fail  → NIGHT_MAFIA
  │             └─ no vote → NIGHT_MAFIA
  └─ no vote  → NIGHT_MAFIA       ◀┘
DAY_LAST_WORD
  ↓
NIGHT_MAFIA  ← consensus across all alive black-team shooters
  ↓
NIGHT_DON    ← one check per night; reveals «is target the sheriff?»
  ↓
NIGHT_SHERIFF← reveals «is target on the black team?»
  ↓
MORNING_ANNOUNCEMENT  (resolves the night kill, bumps dayNumber)
  ↓
DAY_SPEECH (next day)
```

`GAME_OVER` is reachable from any phase the moment `checkWinner` returns a
team or the judge clicks «end game».

## Day cycle rules (ФИИМ)

### Speeches (`DAY_SPEECH`)

- **60 seconds per speaker.**
- Speech order rotates: first day starts at seat 1, second day at seat 2,
  and so on (`dayNumber % 10 + 1`). If the rotational start seat is dead,
  walk clockwise to the next live one.
- The previous-night victim gets a **farewell minute first** before the
  rotation begins (their tile stays visible / audible despite isAlive=false).
- **One nomination per speech.** Judge clicks the seat being nominated;
  the engine records it against the current speaker. Self-nomination is
  allowed.
- **3 fouls = mute** — that player loses speeches but keeps the right to
  vote. (TODO: ФИИМ also lets them gesture-nominate; not yet implemented.)
- **4 fouls is NOT auto-removal**: the foul button refuses, the UI lights
  up red. The judge then decides: roll back with «−Фол» or remove manually.
  This is intentional to prevent one-click technical losses.

### Vote intro (`DAY_VOTE_INTRO`)

Inserted between speeches and the vote so the judge can read out the
nominated players in the order they were nominated. No timer. Special case:
**day 1 + single nominee → no vote, player stays, go to night** (ФИИМ).

### Vote (`DAY_VOTE` / `DAY_REVOTE`)

- **Sequential.** Each candidate gets a 5-second window. Judge clicks
  «Дальше» (or hits Space) to advance to the next round; the engine
  auto-tallies the previous one.
- On the **last round**, any player who didn't manually vote gets
  auto-cast for the last candidate. Exception: **all nominated seats stay
  as abstentions** — a candidate is never forced to vote against a rival.
- **Single nominee on day 2+**: auto-kill without a vote (ФИИМ).
- **Single nominee on day 1**: vote is skipped, player stays, go to night.
- **Disqualification mid-vote** (foul-4 / judge-remove) cancels the
  current vote — no one dies that day.

### Tie-break (`DAY_SHOOTOUT` → `DAY_REVOTE`)

- 30 seconds per tied speaker (ФИИМ).
- Then a revote on only the tied seats.

### Lift (`DAY_LIFT_VOTE`)

Triggered when the revote also ties.

- 30-second yes/no ballot per alive player.
- Threshold: **`yes * 2 >= aliveCount`** (50% of alive — exactly half is
  enough). Abstentions count as «no».
- If passed, every tied seat dies and walks through the multi-victim
  `DAY_LAST_WORD` queue in seat order.

### Last word (`DAY_LAST_WORD`)

- 60 seconds per eliminated player. Their camera and mic stay live for
  the duration.
- **Best Move (ЛХ)** is _not_ given to the day-vote victim. By ФИИМ it
  goes to the **first-night victim** during their morning farewell. See
  «Best Move» below.

## Night cycle rules

### Mafia kill (`NIGHT_MAFIA`)

- 15 seconds.
- All alive black-team seats vote individually for a target.
  Resolution: **unanimous consensus** — if any shooter disagrees or
  doesn't vote, the night ends in a miss.
- Friendly fire is rejected by the engine (mafia can't shoot
  mafia/don).

### Don check (`NIGHT_DON`)

- 15 seconds, one check per night.
- Target's role is compared against `ROLE.SHERIFF` — boolean returned
  to the don only.

### Sheriff check (`NIGHT_SHERIFF`)

- 15 seconds, one check per night.
- Returns `true` for both mafia and don (the sheriff sees «black
  team»).

## Best Move (Лучший Ход)

ФИИМ rule: only the **first-night victim** announces a best move, during
their morning farewell minute. UI shows the form just to that one
player, max 3 unique seats.

Engine guards:

- phase must be `DAY_SPEECH`
- `farewellSeat === currentSpeakerSeat === viewer.seat`
- `dayNumber === 1`
- `firstDayMultiVoteKill === false` — if day 1 lift-all killed 2+, no LH.

## Fouls

| Foul count | Effect                                               |
| ---------- | ---------------------------------------------------- |
| 1          | Warning.                                             |
| 2          | Warning.                                             |
| 3          | **Mute.** Skipped in speech rotation. Vote intact.   |
| 4          | Refused at the engine level. Judge handles manually. |

The judge can roll back with **«−Фол»** (`applyJudgeUnfoul`) when they
hit foul by accident.

«Сказать под фол» (`applyOutOfTurn`) — a player accepts a foul and gets
a 5-second audio window. Blocked at `foulsCount >= 3` so it can't be
used to self-eliminate.

## Revert

The service keeps a 10-deep stack of `GameState` snapshots per game
(`game.registry.ts`). Every judge `advancePhase` / `advanceSpeaker`
pushes a snapshot first. The judge's «↶ Назад» button pops the stack
through `judgeRevert`, restoring the previous state. Important: the
backend pulls a fresh `nextEventSeq` from Postgres on revert so the
`REVERTED` audit row doesn't collide with already-persisted events.

## Files

| File                                           | What's in it                               |
| ---------------------------------------------- | ------------------------------------------ |
| `backend/src/modules/game/game.engine.ts`      | Pure functions, FSM, all rule enforcement. |
| `backend/src/modules/game/game.engine.test.ts` | 75 unit tests — the rule encyclopedia.     |
| `backend/src/modules/game/game.state.ts`       | `GameState` shape + helpers.               |
| `backend/src/modules/game/game.service.ts`     | Orchestration, persistence, broadcast.     |
| `backend/src/modules/game/game.gateway.ts`     | Socket.IO event wiring.                    |
| `backend/src/modules/game/game.bots.ts`        | Minimal bot AI (night kill + checks).      |
| `backend/src/modules/game/game.recovery.ts`    | Event-log replay on backend boot.          |
| `shared/src/constants/{phases,roles,game}.ts`  | Single source of truth for enums + caps.   |

## Adding a new rule

1. Add the test in `game.engine.test.ts` first. The test is the spec.
2. Make it pass in `game.engine.ts`. Don't reach for IO.
3. If the new rule needs new state, add the field to `game.state.ts`,
   initial value in `createGameFromLobby` (service) and in
   `replayState` (recovery).
4. If it needs a new client event, add to `shared/constants/ws-events.ts`
   first, wire `gateway → service → engine`.
5. Run `pnpm --filter @mafia/backend test`. 75/75 is the floor.
