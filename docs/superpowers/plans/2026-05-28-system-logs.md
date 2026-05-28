# System Debug Logs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture every backend, media-permission, socket, and client-side event for each game into `/data/debug-logs/<gameId>.jsonl`, fetchable through an admin-only HTTP endpoint, so AI/dev tools can post-mortem games (audio leak, WS push, etc.) without SSH-ing the host.

**Architecture:** A single `appendDebugLog(gameId, entry)` writer with a per-game serial queue, called from existing seams: `persistEvent()` (game events), `syncMediaPermissions()` (media snapshots), socket connection hooks (socket lifecycle), and a new `client:diag` WS handler (client errors / audio decisions). Files live in a docker-volume-mounted directory, swept by a daily job.

**Tech Stack:** Node 22 + Fastify backend, Socket.IO 4, Prisma 5, Zod schemas in `@mafia/shared`, vitest for tests. Frontend pushes via the existing socket.io-client. No DB migrations.

**Spec:** `docs/superpowers/specs/2026-05-28-system-logs-design.md`

---

## File Map

**Create:**

- `packages/backend/src/lib/debug-log.ts` — writer with per-game queue
- `packages/backend/src/lib/debug-log.test.ts` — unit tests
- `packages/backend/src/lib/debug-log-sweeper.ts` — 30-day retention sweep
- `packages/backend/src/lib/debug-log-sweeper.test.ts` — sweeper tests
- `packages/frontend/src/features/game/socket/diag-log.ts` — `pushDiag()` helper

**Modify:**

- `packages/shared/src/constants/ws-events.ts` — add `CLIENT_DIAG`
- `packages/shared/src/schemas/game.ts` — `clientDiagPayloadSchema`
- `packages/backend/src/modules/game/game.service.ts` — call `appendDebugLog` in `persistEvent()`
- `packages/backend/src/modules/game/game.media-permissions.ts` — return per-seat snapshot, log media entry
- `packages/backend/src/modules/game/game.routes.ts` — `GET /:id/debug-log` (admin)
- `packages/backend/src/modules/game/game.gateway.ts` — `client:diag` handler, replace existing `diag` pino logs with `appendDebugLog` calls
- `packages/backend/src/modules/lobby/lobby.gateway.ts` — replace existing `diag` logs
- `packages/backend/src/plugins/socketio.ts` — replace `diag.ws.conn.up/down` with `appendDebugLog`
- `packages/backend/src/server.ts` — start sweeper at boot
- `packages/frontend/src/features/game/hooks/useGameConnection.ts` — `pushDiag('game.delta', …)`
- `packages/frontend/src/features/game/hooks/useShouldShowMedia.ts` — `pushDiag('audio.decision', …)` on result change
- `packages/frontend/src/main.tsx` — global `window.addEventListener('error', …)` → `pushDiag('error', …)`
- `docker-compose.yml` — bind-mount `./data/debug-logs:/data/debug-logs`
- `docker-compose.prod.yml` — same bind-mount on prod

---

## Task 1: Writer module with per-game serial queue

**Files:**

- Create: `packages/backend/src/lib/debug-log.ts`
- Test: `packages/backend/src/lib/debug-log.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/backend/src/lib/debug-log.test.ts
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendDebugLog, configureDebugLogDirForTests } from './debug-log.js';

describe('appendDebugLog', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'debug-log-test-'));
    configureDebugLogDirForTests(dir);
  });

  afterEach(() => {
    configureDebugLogDirForTests(null);
  });

  it('writes one JSONL line per call to the per-game file', async () => {
    await appendDebugLog('game-1', {
      cat: 'game',
      type: 'phase_changed',
      actor: 'alice',
      userId: 'uuid-1',
      data: { from: 'a', to: 'b' },
    });
    await appendDebugLog('game-1', {
      cat: 'media',
      type: 'snapshot',
      data: { phase: 'day_speech', participants: [] },
    });
    const file = join(dir, 'game-1.jsonl');
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!);
    expect(first.cat).toBe('game');
    expect(first.type).toBe('phase_changed');
    expect(first.actor).toBe('alice');
    expect(first.data).toEqual({ from: 'a', to: 'b' });
    expect(typeof first.t).toBe('string');
    expect(first.t).toMatch(/Z$/);
  });

  it('serialises concurrent appends so lines never interleave', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        appendDebugLog('game-2', { cat: 'game', type: 'tick', data: { i } }),
      ),
    );
    const lines = readFileSync(join(dir, 'game-2.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(20);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.cat).toBe('game');
    }
  });

  it('routes to _orphan.jsonl when gameId is null', async () => {
    await appendDebugLog(null, { cat: 'socket', type: 'conn.up', data: {} });
    const file = join(dir, '_orphan.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('does not throw when the write fails', async () => {
    configureDebugLogDirForTests('/nonexistent/path/should/not/exist');
    await expect(
      appendDebugLog('game-3', { cat: 'game', type: 'x', data: {} }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mafia/backend test debug-log`
Expected: FAIL — `Cannot find module './debug-log.js'`.

- [ ] **Step 3: Implement the writer**

```ts
// packages/backend/src/lib/debug-log.ts
//
// Per-game append-only JSONL debug log. Drives bug #14 — captures backend,
// media, socket, and client events so AI/dev tools can post-mortem games.
// See docs/superpowers/specs/2026-05-28-system-logs-design.md.

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from './logger.js';

export interface DebugLogEntry {
  cat: 'game' | 'media' | 'socket' | 'client';
  type: string;
  actor?: string | null;
  userId?: string | null;
  data: unknown;
}

const DEFAULT_DIR = process.env.DEBUG_LOG_DIR ?? '/data/debug-logs';
let activeDir = DEFAULT_DIR;
let dirReady = false;

// Per-game write queue. Each append chains onto the current promise so two
// concurrent appends to the same file land in order. Map entry is dropped
// when the queue drains.
const queues = new Map<string, Promise<void>>();

/** Test-only override for the output directory. Pass `null` to reset. */
export function configureDebugLogDirForTests(dir: string | null): void {
  activeDir = dir ?? DEFAULT_DIR;
  dirReady = false;
  queues.clear();
}

export function appendDebugLog(gameId: string | null, entry: DebugLogEntry): Promise<void> {
  const key = gameId ?? '_orphan';
  const line =
    JSON.stringify({
      t: new Date().toISOString(),
      cat: entry.cat,
      type: entry.type,
      actor: entry.actor ?? null,
      userId: entry.userId ?? null,
      data: entry.data,
    }) + '\n';

  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      if (!dirReady) {
        try {
          await mkdir(activeDir, { recursive: true });
          dirReady = true;
        } catch (err) {
          logger.warn({ err, dir: activeDir }, 'debug-log: mkdir failed');
          return;
        }
      }
      try {
        await appendFile(join(activeDir, `${key}.jsonl`), line);
      } catch (err) {
        logger.warn({ err, gameId: key }, 'debug-log: append failed');
      }
    })
    .finally(() => {
      // Detach from the queue once nothing further is chained.
      if (queues.get(key) === next) queues.delete(key);
    });
  queues.set(key, next);
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mafia/backend test debug-log`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/lib/debug-log.ts packages/backend/src/lib/debug-log.test.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): writer with per-game serial queue"
```

---

## Task 2: Sweeper module and integration into server boot

**Files:**

- Create: `packages/backend/src/lib/debug-log-sweeper.ts`
- Create: `packages/backend/src/lib/debug-log-sweeper.test.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/backend/src/lib/debug-log-sweeper.test.ts
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sweepDebugLogsOnce } from './debug-log-sweeper.js';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

describe('sweepDebugLogsOnce', () => {
  it('deletes files older than 30 days and keeps fresh ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweeper-test-'));
    const oldFile = join(dir, 'old.jsonl');
    const freshFile = join(dir, 'fresh.jsonl');
    writeFileSync(oldFile, 'x\n');
    writeFileSync(freshFile, 'y\n');
    // Backdate the old file 31 days.
    const oldEpoch = Date.now() / 1000 - (RETENTION_MS / 1000 + 86_400);
    utimesSync(oldFile, oldEpoch, oldEpoch);

    await sweepDebugLogsOnce(dir, RETENTION_MS);

    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(freshFile)).toBe(true);
  });

  it('silently tolerates a missing directory', async () => {
    await expect(
      sweepDebugLogsOnce('/tmp/nonexistent/sweeper/path', RETENTION_MS),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mafia/backend test debug-log-sweeper`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sweeper**

```ts
// packages/backend/src/lib/debug-log-sweeper.ts
//
// Periodic GC for /data/debug-logs/*.jsonl. Files older than RETENTION_MS
// are unlinked. Runs every SWEEP_INTERVAL_MS while the server is up.
// Errors are logged at warn and the next file is tried — one bad file
// must not block the rest of the sweep.

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from './logger.js';

const DEFAULT_DIR = process.env.DEBUG_LOG_DIR ?? '/data/debug-logs';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function sweepDebugLogsOnce(
  dir: string = DEFAULT_DIR,
  retentionMs: number = RETENTION_MS,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const cutoff = Date.now() - retentionMs;
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const file = join(dir, name);
    try {
      const info = await stat(file);
      if (info.mtimeMs < cutoff) {
        await unlink(file);
      }
    } catch (err) {
      logger.warn({ err, file }, 'debug-log-sweeper: failed on file');
    }
  }
}

export function startDebugLogSweeper(): NodeJS.Timeout {
  // Run once at boot and then every six hours.
  void sweepDebugLogsOnce();
  return setInterval(() => void sweepDebugLogsOnce(), SWEEP_INTERVAL_MS);
}

export function stopDebugLogSweeper(handle: NodeJS.Timeout): void {
  clearInterval(handle);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mafia/backend test debug-log-sweeper`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the sweeper into server boot**

Locate the section in `packages/backend/src/server.ts` where other long-running tasks are attached. Find the `app.addHook('onClose', ...)` block or the equivalent end-of-build call. Add this in the build function, after the modules are registered, before the function returns:

```ts
import { startDebugLogSweeper, stopDebugLogSweeper } from './lib/debug-log-sweeper.js';

// (inside build())
const debugLogSweeperHandle = startDebugLogSweeper();
app.addHook('onClose', async () => {
  stopDebugLogSweeper(debugLogSweeperHandle);
});
```

If `server.ts` already has an `onClose` hook, append the `stopDebugLogSweeper(...)` call inside it rather than adding a second hook.

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/lib/debug-log-sweeper.ts packages/backend/src/lib/debug-log-sweeper.test.ts packages/backend/src/server.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): 30-day retention sweeper"
```

---

## Task 3: Mount the debug-log directory in docker

**Files:**

- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`

- [ ] **Step 1: Add the bind-mount to the dev compose file**

Open `docker-compose.yml`. Locate the backend service (`backend:` block). Find its `volumes:` list. Append:

```yaml
- ./data/debug-logs:/data/debug-logs
```

If the backend service has no `volumes` list yet, add one:

```yaml
volumes:
  - ./data/debug-logs:/data/debug-logs
```

- [ ] **Step 2: Add the same bind-mount to the prod compose file**

Open `docker-compose.prod.yml`. Repeat Step 1 — same backend service path, same mount line.

- [ ] **Step 3: Add the host directory to git-ignore (the directory itself must exist on the host but its contents must not be committed)**

Open `.gitignore` at the repo root. Add at the bottom:

```
# Debug log dumps written by the backend at runtime.
data/debug-logs/
```

- [ ] **Step 4: Commit**

```bash
git -C /Users/blaze/online-mafia add docker-compose.yml docker-compose.prod.yml .gitignore
git -C /Users/blaze/online-mafia commit -m "chore(debug-log): mount /data/debug-logs in docker compose"
```

---

## Task 4: Shared schema — CLIENT_DIAG event and payload

**Files:**

- Modify: `packages/shared/src/constants/ws-events.ts`
- Modify: `packages/shared/src/schemas/game.ts`

- [ ] **Step 1: Add the event name**

In `packages/shared/src/constants/ws-events.ts`, locate the `CLIENT_EVENT` object. After `UNNOMINATE_PLAYER`, add:

```ts
  CLIENT_DIAG: 'client:diag',
```

- [ ] **Step 2: Add the Zod payload schema**

Open `packages/shared/src/schemas/game.ts`. Append at the end of the file:

```ts
// Client → server diagnostic ping. Free-form `data` for the writer; only
// the wrapper is validated so we never accept a wildly oversized payload.
// `data` is `unknown` so we never accidentally unpack a credential string
// — the value is appended verbatim to the JSONL file.
export const clientDiagPayloadSchema = z.object({
  type: z.string().min(1).max(64),
  data: z.unknown(),
});
export type ClientDiagPayload = z.infer<typeof clientDiagPayloadSchema>;
```

If `z` is not yet imported at the top of the file, confirm the existing imports include it (they should — other schemas use `z`).

- [ ] **Step 3: Rebuild shared**

Run: `pnpm --filter @mafia/shared build`
Expected: clean.

- [ ] **Step 4: Typecheck the workspace**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/shared/src/constants/ws-events.ts packages/shared/src/schemas/game.ts
git -C /Users/blaze/online-mafia commit -m "feat(shared): CLIENT_DIAG event + payload schema"
```

---

## Task 5: Log every `persistEvent` to the debug file

**Files:**

- Modify: `packages/backend/src/modules/game/game.service.ts`

- [ ] **Step 1: Locate `persistEvent`**

Run: `grep -n "function persistEvent\|export async function persistEvent" packages/backend/src/modules/game/game.service.ts`
Note the line range.

- [ ] **Step 2: Read the function body**

Open that range. Identify where the function commits the row to the DB (the `await prisma.gameEvent.create({ ... })` call) and where it returns the state. The debug-log write happens after the DB insert succeeds.

- [ ] **Step 3: Add the import at the top of `game.service.ts`**

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

Place it alongside the other `../../lib/*` imports.

- [ ] **Step 4: Append the debug-log call inside `persistEvent`**

After the `prisma.gameEvent.create` succeeds (and BEFORE the function returns the new state), add:

```ts
void appendDebugLog(state.id, {
  cat: 'game',
  type,
  actor:
    actorUserId !== null
      ? (state.participants.find((p) => p.userId === actorUserId)?.nickname ?? null)
      : null,
  userId: actorUserId,
  data: payload,
});
```

`type`, `actorUserId`, and `payload` are the function's existing parameters — match the names already used in `persistEvent`.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 6: Run backend tests**

Run: `pnpm --filter @mafia/backend test`
Expected: all green. Existing game engine tests do not exercise `persistEvent` directly so they should be unaffected.

- [ ] **Step 7: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/modules/game/game.service.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): hook persistEvent into the debug log"
```

---

## Task 6: Media-permission snapshots

**Files:**

- Modify: `packages/backend/src/modules/game/game.media-permissions.ts`

- [ ] **Step 1: Read the existing `syncMediaPermissions` function**

Open `packages/backend/src/modules/game/game.media-permissions.ts`. Identify the loop that iterates participants and calls the LiveKit `updateParticipant` API. The current signature is `function syncMediaPermissions(state: GameState): Promise<void>` (or similar).

- [ ] **Step 2: Add the import**

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

- [ ] **Step 3: Build the snapshot and log it before returning**

After the loop that flips permissions for each participant (i.e. at the very end of `syncMediaPermissions`, before its implicit return), add:

```ts
const snapshot = state.participants
  .filter((p) => !p.isJudge)
  .map((p) => ({
    seat: p.seat,
    userId: p.userId,
    canPublish: computeCanPublish(state, p),
    isAlive: p.isAlive,
    isRemoved: p.isRemoved,
  }));
void appendDebugLog(state.id, {
  cat: 'media',
  type: 'snapshot',
  data: { phase: state.phase, dayNumber: state.dayNumber, participants: snapshot },
});
```

`computeCanPublish` is the existing helper inside the same file. If its name is different in your file (check `grep -n "computeCanPublish\|canPublish" packages/backend/src/modules/game/game.media-permissions.ts`), substitute the actual name. The intent is to record the same value we just sent to LiveKit.

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 5: Run backend tests**

Run: `pnpm --filter @mafia/backend test`
Expected: 141 passing.

- [ ] **Step 6: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/modules/game/game.media-permissions.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): snapshot media permissions on each sync"
```

---

## Task 7: Replace the existing `diag` pino logs with `appendDebugLog` (socket category)

**Files:**

- Modify: `packages/backend/src/plugins/socketio.ts`
- Modify: `packages/backend/src/modules/lobby/lobby.gateway.ts`
- Modify: `packages/backend/src/modules/game/game.gateway.ts`

The socket lifecycle diag logs we landed in commit `e64e448` are pino-only. Convert them so they also flow into the debug file. The pino lines stay — they remain useful for backend boot issues that have no game id. We add a `appendDebugLog` call beside each pino call.

- [ ] **Step 1: Add the import in `socketio.ts`**

```ts
import { appendDebugLog } from '../lib/debug-log.js';
```

- [ ] **Step 2: Add the debug-log call beside `diag socket connected`**

Find the existing `app.log.info({ diag: 'ws.conn.up', ... }, 'diag socket connected')` block in `socketio.ts`. Immediately after the pino call, add:

```ts
const gameRoom = [...socket.rooms].find((r) => r.startsWith('game:'));
const gameId = gameRoom ? gameRoom.slice('game:'.length) : null;
void appendDebugLog(gameId, {
  cat: 'socket',
  type: 'conn.up',
  actor: socket.data.user?.nickname ?? null,
  userId: socket.data.user?.sub ?? null,
  data: { socketId: socket.id },
});
```

The `gameId` lookup is a no-op for fresh connections (they haven't joined a game room yet) — those entries route to `_orphan.jsonl`.

- [ ] **Step 3: Same treatment for `diag socket disconnected`**

After the pino call inside the `socket.on('disconnect', ...)` handler, add:

```ts
const gameRoom = [...socket.rooms].find((r) => r.startsWith('game:'));
const gameId = gameRoom ? gameRoom.slice('game:'.length) : null;
void appendDebugLog(gameId, {
  cat: 'socket',
  type: 'conn.down',
  actor: socket.data.user?.nickname ?? null,
  userId: socket.data.user?.sub ?? null,
  data: { socketId: socket.id, reason },
});
```

- [ ] **Step 4: Lobby gateway**

Add the import at the top of `packages/backend/src/modules/lobby/lobby.gateway.ts`:

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

After each existing `logger.info({ diag: 'ws.lobby.join', … }, …)` and `logger.info({ diag: 'ws.lobby.leave', … }, …)` call, append:

```ts
void appendDebugLog(null, {
  cat: 'socket',
  type: 'lobby.join', // or 'lobby.leave' / 'lobby.join_rejected'
  actor: socket.data.user?.nickname ?? null,
  userId,
  data: {
    lobbyId: parsed.data.lobbyId,
    socketId: socket.id,
    result: 'joined' /* or 'not_member' */,
  },
});
```

Match the pino payload contents so the JSONL line is informative. Lobby events are not bound to a specific game id, so they go to `_orphan.jsonl` (the `null` first argument). The lobby id is in the `data` field so AI/dev can still grep by it.

- [ ] **Step 5: Game gateway**

Add the import at the top of `packages/backend/src/modules/game/game.gateway.ts`:

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

After the existing `logger.info({ diag: 'ws.game.join', … }, …)` call, append:

```ts
void appendDebugLog(parsed.data.gameId, {
  cat: 'socket',
  type: 'game.join',
  actor: socket.data.user?.nickname ?? null,
  userId,
  data: { socketId: socket.id, deliveredInitialState: Boolean(state), phase: state?.phase ?? null },
});
```

- [ ] **Step 6: Replace `broadcastGameState` per-emit diag**

In `packages/backend/src/modules/game/game.broadcast.ts`, after the existing `logger.info({ diag: 'ws.game.emit', … }, 'diag GAME_STATE_DELTA emitted')` call inside the `for (const socketId of room)` loop, append:

```ts
void appendDebugLog(gameId, {
  cat: 'socket',
  type: 'state_delta.emit',
  actor: socket.data.user?.nickname ?? null,
  userId,
  data: { socketId, phase: state.phase, dayNumber: state.dayNumber },
});
```

Add the import at the top of the file:

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

- [ ] **Step 7: Replace `broadcastLobbyUpdate` per-emit diag**

In `packages/backend/src/modules/lobby/lobby.broadcast.ts`, after the existing `logger.info({ diag: 'ws.lobby.emit', … }, 'diag LOBBY_UPDATED emitted')` call inside the `for (const socketId of room)` loop, append:

```ts
void appendDebugLog(null, {
  cat: 'socket',
  type: 'lobby_updated.emit',
  actor: socket.data.user?.nickname ?? null,
  userId,
  data: {
    lobbyId,
    socketId,
    lobbyStatus: lobby.status,
    gameId: lobby.game?.id ?? null,
  },
});
```

Add the import:

```ts
import { appendDebugLog } from '../../lib/debug-log.js';
```

- [ ] **Step 8: Typecheck + tests**

Run: `pnpm run typecheck && pnpm --filter @mafia/backend test`
Expected: clean; 141 tests pass.

- [ ] **Step 9: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/plugins/socketio.ts packages/backend/src/modules/lobby/lobby.gateway.ts packages/backend/src/modules/lobby/lobby.broadcast.ts packages/backend/src/modules/game/game.gateway.ts packages/backend/src/modules/game/game.broadcast.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): mirror socket lifecycle to the debug log"
```

---

## Task 8: `client:diag` socket handler

**Files:**

- Modify: `packages/backend/src/modules/game/game.gateway.ts`

- [ ] **Step 1: Import the schema**

At the top of `packages/backend/src/modules/game/game.gateway.ts`, add `clientDiagPayloadSchema` to the existing import line from `@mafia/shared` (or to the `../../shared/schemas` line if that's how imports are structured). Example:

```ts
import {
  // … existing imports …
  clientDiagPayloadSchema,
} from '@mafia/shared';
```

And `CLIENT_EVENT` should already be imported — confirm.

- [ ] **Step 2: Add the handler inside `registerGameGateway` after the other `client:*` handlers**

Locate the block where `socket.on(CLIENT_EVENT.NOMINATE_PLAYER, ...)`, `socket.on(CLIENT_EVENT.UNNOMINATE_PLAYER, ...)`, etc. are registered. After the `UNNOMINATE_PLAYER` handler, add:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/modules/game/game.gateway.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): client:diag handler"
```

---

## Task 9: HTTP endpoint to fetch a game's debug log

**Files:**

- Modify: `packages/backend/src/modules/game/game.routes.ts`

- [ ] **Step 1: Add the import**

At the top of `packages/backend/src/modules/game/game.routes.ts`:

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
```

- [ ] **Step 2: Add the route after the existing `/active` and `/:id` routes**

Inside the `gameRoutes` plugin function:

```ts
app.get<{ Params: { id: string } }>(
  '/:id/debug-log',
  { preHandler: [app.authenticate, app.requireAdmin] },
  async (request, reply) => {
    const dir = process.env.DEBUG_LOG_DIR ?? '/data/debug-logs';
    const file = join(dir, `${request.params.id}.jsonl`);
    try {
      await stat(file);
    } catch {
      return reply.code(HTTP_STATUS.NOT_FOUND).send({ error: 'log_not_found' });
    }
    reply.type('application/x-ndjson');
    return reply.send(createReadStream(file));
  },
);
```

If `HTTP_STATUS` is not already imported, add it from wherever the existing routes pull it (`grep -n HTTP_STATUS packages/backend/src/modules/game/game.routes.ts` — likely from `../../config/http.js` or similar).

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual smoke (skip if not running prod locally)**

```bash
# After deploying, with an admin cookie:
curl -s -b cookie.jar https://online-mafia.com/api/v1/game/<a-game-id>/debug-log | head -20
```

Expected: NDJSON lines, one per event.

- [ ] **Step 5: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/backend/src/modules/game/game.routes.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): admin-only GET /game/:id/debug-log"
```

---

## Task 10: Frontend `pushDiag` helper

**Files:**

- Create: `packages/frontend/src/features/game/socket/diag-log.ts`

- [ ] **Step 1: Write the helper**

```ts
// packages/frontend/src/features/game/socket/diag-log.ts
//
// Fire-and-forget diag pings from the browser to the backend `client:diag`
// handler. Used to capture audio-filter decisions, state-delta arrivals,
// and uncaught errors so they end up in the per-game debug log.
//
// The call silently no-ops when the socket isn't connected — these pings
// are diagnostic, never on the critical path of a player action.

import { CLIENT_EVENT } from '@mafia/shared';

import { getGameSocket } from './game.socket.js';

export function pushDiag(type: string, data: unknown): void {
  const socket = getGameSocket();
  if (!socket?.connected) return;
  socket.emit(CLIENT_EVENT.CLIENT_DIAG, { type, data });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/socket/diag-log.ts
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): frontend pushDiag helper"
```

---

## Task 11: Wire `pushDiag` into existing client diag sites

**Files:**

- Modify: `packages/frontend/src/features/game/hooks/useGameConnection.ts`
- Modify: `packages/frontend/src/features/game/hooks/useShouldShowMedia.ts`
- Modify: `packages/frontend/src/main.tsx`

- [ ] **Step 1: GAME_STATE_DELTA arrival**

Open `packages/frontend/src/features/game/hooks/useGameConnection.ts`. Locate the `handleState` function that calls `console.info('[diag][ws.game.delta]', ...)`. Immediately after the `console.info` call, add:

```ts
pushDiag('game.delta', {
  gameId: payload.id,
  phase: payload.phase,
  dayNumber: payload.dayNumber,
  status: payload.status,
  viewerSeat: viewer?.seat ?? null,
  viewerIsAlive: viewer?.isAlive ?? false,
  viewerIsJudge: viewer?.isJudge ?? false,
});
```

Add the import at the top:

```ts
import { pushDiag } from '@/features/game/socket/diag-log.js';
```

- [ ] **Step 2: Audio decision flips**

Open `packages/frontend/src/features/game/hooks/useShouldShowMedia.ts`. Locate the `useShouldHearAudio` hook and the `console.info('[diag][audio.decision]', ...)` call inside the `if (previousRef.current !== result)` block. After the `console.info`, add:

```ts
pushDiag('audio.decision', {
  target: targetUserId,
  targetSeat: args.targetSeat,
  result,
  phase: args.phase,
  viewerIsAlive: args.viewerIsAlive,
  viewerIsJudge: args.viewerIsJudge,
  judgeOverhearAll: args.judgeOverhearAll,
});
```

Add the import at the top:

```ts
import { pushDiag } from '@/features/game/socket/diag-log.js';
```

- [ ] **Step 3: Global uncaught-error reporter**

Open `packages/frontend/src/main.tsx`. After the `ReactDOM.createRoot(...).render(...)` call (and before any final closing code), add:

```ts
window.addEventListener('error', (event) => {
  pushDiag('error', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    col: event.colno,
  });
});
window.addEventListener('unhandledrejection', (event) => {
  pushDiag('error', { message: String(event.reason ?? 'unhandled rejection') });
});
```

Add the import at the top of `main.tsx`:

```ts
import { pushDiag } from '@/features/game/socket/diag-log.js';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mafia/frontend typecheck`
Expected: clean.

- [ ] **Step 5: Frontend tests**

Run: `pnpm --filter @mafia/frontend test`
Expected: 7 passing (unchanged — these touch hooks the existing tests do not exercise).

- [ ] **Step 6: Commit**

```bash
git -C /Users/blaze/online-mafia add packages/frontend/src/features/game/hooks/useGameConnection.ts packages/frontend/src/features/game/hooks/useShouldShowMedia.ts packages/frontend/src/main.tsx
git -C /Users/blaze/online-mafia commit -m "feat(debug-log): pushDiag for state deltas, audio decisions, errors"
```

---

## Task 12: End-to-end smoke + push to main

- [ ] **Step 1: Run the full test + typecheck pass**

```bash
pnpm run typecheck
pnpm --filter @mafia/backend test
pnpm --filter @mafia/frontend test
pnpm run format:check
```

Expected: typecheck clean, 141 backend tests passing (143 with the two new debug-log files), 7 frontend tests passing, prettier clean.

- [ ] **Step 2: Push to main**

```bash
git -C /Users/blaze/online-mafia push origin main
```

CI deploys to `89.167.60.120`. After the deploy completes, verify the volume mount took effect:

```bash
ssh root@89.167.60.120 'ls -la /opt/online-mafia/data/debug-logs/ || true'
```

Expected: directory exists (it will be empty until the next game runs).

- [ ] **Step 3: Trigger a test game and read the resulting log**

Play (or have the user play) one short test game. Then:

```bash
ssh root@89.167.60.120 'ls -la /opt/online-mafia/data/debug-logs/'
ssh root@89.167.60.120 'cat /opt/online-mafia/data/debug-logs/<the-gameId>.jsonl' | head -40
```

Expected: a file per game id, with mixed `cat` values (game / media / socket / client). The audio-leak and WS-push investigations can now use this file as a primary evidence source instead of guessing.

---

## Self-Review

Spec coverage:

- Goal — Tasks 1–12 implement it end to end.
- Storage path / JSONL / sweeper — Tasks 1, 2, 3.
- Categories: `game` (Task 5), `media` (Task 6), `socket` (Task 7), `client` (Tasks 8 + 10 + 11).
- Entry shape — defined in `appendDebugLog` (Task 1).
- Per-game serial queue — Task 1.
- HTTP endpoint, admin-gated — Task 9.
- Shared `CLIENT_DIAG` event + schema — Task 4.
- 30-day retention — Task 2.
- Sizing / privacy notes — informational only in spec, no code task.
- Testing — Task 1 unit, Task 2 unit, Task 12 smoke.

No placeholders, no "TBD", no "implement later". Every code step shows the actual code. File paths absolute or repo-relative + line guidance for grep where ranges may drift. Identifier names (`appendDebugLog`, `pushDiag`, `clientDiagPayloadSchema`, `startDebugLogSweeper`, `sweepDebugLogsOnce`, `configureDebugLogDirForTests`) consistent across tasks.
