# System debug logs — design

**Status:** approved 2026-05-28 (brainstorm)
**Audience of the feature:** developers / AI assistant only. Not exposed to players.
**Drives bug:** #14 from the playtest report — «нужно покрыть код системными логами,
чтобы после игры формировалась таблица логов … чтобы ты понимал что отвалилось».

## Goal

Make every in-progress game replayable from a single artifact that captures
both server actions (already in `GameEvent`) and the surrounding side-effects:
media-permission flips, socket lifecycle, and client-side decisions
(audio-filter result, GAME_STATE_DELTA arrival, console errors). The artifact
must survive a backend restart and be fetchable by AI/dev tools without
SSH-ing into the host.

A previous bug round (alive player «слышит всех в двух играх подряд», WS push
not reaching the lobby) hit a wall because we could not tell from outside
whether the backend sent the right projection, whether the socket was in the
room, or whether the client's audio filter actually returned `false`. This
spec closes that gap.

## Non-goals

- No player-facing UI. Logs are dev-only and never appear in the lobby / game
  pages.
- No replay engine. We are recording, not reconstructing; replay from the
  log is a downstream concern.
- No localisation, theming, or accessibility work on the dump.
- No live tailing UI. Reading is "fetch file, grep / jq".

## Audience and access

- AI / developer only. The HTTP endpoint is admin-gated with
  `app.requireAdmin` (same gate `/admin` routes use).
- Local-host workflow is `ssh root@89.167.60.120` + `cat
/opt/online-mafia/data/debug-logs/<gameId>.jsonl`. Fast path when AI has SSH.

## Storage

- Path inside the container: `/data/debug-logs/<gameId>.jsonl`.
- The host mounts `./data/debug-logs` on the same path (added to
  `docker-compose.prod.yml` and `docker-compose.yml`).
- JSONL (one JSON object per line). Easy to `tail`, `grep`, `jq`, no parser
  needed beyond `JSON.parse(line)`.
- File is created on first event for a game; never moved. When the game
  ends we do not flush a "done" marker — the file simply stops growing.
- Sweeper job removes files whose mtime is older than 30 days. Lives in
  `lib/debug-log-sweeper.ts`, started from `server.ts` next to
  `startLobbySweeper()`. Period: every 6 hours.

## Categories

Each log entry carries a `cat` field. Four values:

| `cat`    | Source                                                  | Examples                                                                                                |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `game`   | `persistEvent()` inside `game.service.ts`               | phase_changed, player_voted, player_killed_by_vote, foul_issued, … (existing 19 types)                  |
| `media`  | `syncMediaPermissions()` in `game.media-permissions.ts` | snapshot after every call: per-seat `canPublish` + `isMicPub` + `isCamPub`                              |
| `socket` | `socketio.ts` connection hook + lobby/game gateways     | conn.up, conn.down, lobby.join, lobby.leave, game.join                                                  |
| `client` | Frontend pushes via `client:diag` WS event              | audio.decision (rule flipped per target), game.delta (state delta received), error (uncaught exception) |

The existing `diag` logs added in commit `e64e448` are replaced by entries
under `socket`. Their pino lines stay in stdout — the debug-log file is a
second sink, not a replacement, because pino still helps with backend boot
issues that have no associated game.

## Entry shape

```json
{
  "t": "2026-05-28T08:30:01.234Z",
  "cat": "game",
  "type": "phase_changed",
  "actor": "alice",
  "userId": "uuid-of-actor",
  "data": { "from": "day_speech", "to": "day_vote_intro" }
}
```

Fields:

- `t` — ISO timestamp with millisecond precision (always set on the server).
- `cat` — one of the four categories above.
- `type` — sub-type within the category (e.g. `phase_changed`, `audio.decision`).
- `actor` — display nickname when known, else `null`. Used so a human can
  read the file without joining against the user table.
- `userId` — UUID of the actor when known, else `null`.
- `data` — free-form JSON payload, shape determined by `cat:type`.

We do not include a `seq` field. The append order in the file IS the order
of events, and entries from different categories interleave naturally with
their `t` value. Tools that need a deterministic order across replays can
sort by `t` (millisecond resolution is enough at our event rate).

## Server: the writer

`packages/backend/src/lib/debug-log.ts` — new file. Exports
`appendDebugLog(gameId: string, entry: DebugLogEntry): void`.

Behaviour:

- Builds the JSON line synchronously, then writes asynchronously via a
  per-game write queue. The queue serialises appends so two events firing
  in the same tick cannot interleave bytes.
- `fs.appendFile(path, line + '\n')` per entry. `fs.mkdir(dir, { recursive:
true })` once per process at startup.
- On write error, log via pino at warn level and drop the entry. Writing
  is never on the critical path of a player action.
- The queue is a `Map<gameId, Promise<void>>`; each append chains onto
  the current promise. Garbage-collected by removing the entry when the
  promise resolves to nothing pending.

## Server: emit sites

| Site                                               | Wire-up                                                                                                                                                                                                                                                               | New code                                                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `game.service.ts:persistEvent()`                   | call `appendDebugLog(gameId, { cat: 'game', type, actor: nicknameLookup, userId, data: payload })` after each successful event row                                                                                                                                    | ~5 lines inside existing function                                                           |
| `game.media-permissions.ts:syncMediaPermissions()` | extend return value to expose the per-seat permission map; call `appendDebugLog(gameId, { cat: 'media', type: 'snapshot', data: { phase, participants: [...] } })`                                                                                                    | ~20 lines; touches `game.service.ts` callsites only if return value already used (it isn't) |
| `plugins/socketio.ts` connection / disconnect hook | replace existing `app.log.info({ diag: 'ws.conn.up', ... })` with `appendDebugLog(gameIdHint, { cat: 'socket', type: 'conn.up', ... })`. `gameIdHint` comes from `socket.rooms` (`game:<id>`), so an unbound socket logs to `_orphan.jsonl`                           | ~10 lines                                                                                   |
| `lobby.gateway.ts` LOBBY_JOIN / LOBBY_LEAVE        | same — convert diag log to `appendDebugLog`. Lobby events use `_orphan.jsonl` until a game id is known                                                                                                                                                                | ~6 lines                                                                                    |
| `game.gateway.ts` GAME_JOIN                        | same conversion                                                                                                                                                                                                                                                       | ~4 lines                                                                                    |
| `game.gateway.ts` new `client:diag` handler        | validate payload (small Zod schema), pull `gameId` from `socket.rooms`, call `appendDebugLog(gameId, { cat: 'client', type: payload.type, actor: nickname, userId, data: payload.data })`. Rate-limited to 50/10 s per user (existing rate limiter, dedicated bucket) | ~30 lines                                                                                   |

## Client: push channel

`packages/frontend/src/features/game/socket/diag-log.ts` — new helper.

```ts
export function pushDiag(type: string, data: unknown): void {
  const socket = getGameSocket();
  if (!socket?.connected) return;
  socket.emit(CLIENT_EVENT.CLIENT_DIAG, { type, data });
}
```

Existing `console.info('[diag][…]', ...)` callsites get a sibling
`pushDiag(...)` call:

- `hooks/useGameConnection.ts` on `GAME_STATE_DELTA`: `pushDiag('game.delta',
{ phase, dayNumber, viewerSeat, viewerIsAlive })`.
- `hooks/useShouldShowMedia.ts` audio decision change: `pushDiag('audio.decision',
{ target, result, phase, viewerIsAlive, viewerIsJudge, judgeOverhearAll, … })`.
- Add a global `window.addEventListener('error', e => pushDiag('error',
{ message: e.message, source: e.filename }))` in `main.tsx` so uncaught
  exceptions show up in the file.

`console.info` lines stay for browser-DevTools debugging. The push is
additive.

## HTTP endpoint

`GET /api/v1/game/:id/debug-log`

- `preHandler: [app.authenticate, app.requireAdmin]`.
- Streams the file with `Content-Type: application/x-ndjson` so AI/dev
  can pipe `curl ... | jq -c '.[]'`.
- Returns 404 if the file does not exist (game id wrong, or never had
  events, or already swept).

## Sweeper

`packages/backend/src/lib/debug-log-sweeper.ts`:

```ts
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startDebugLogSweeper(): NodeJS.Timeout { … }
export function stopDebugLogSweeper(handle: NodeJS.Timeout): void { … }
```

Scans `/data/debug-logs/*.jsonl`, `fs.stat`, `unlink` if mtime older than
30 days. Errors warn and continue.

## Shared schema

`packages/shared/src/constants/ws-events.ts`:

```ts
CLIENT_DIAG: 'client:diag',
```

`packages/shared/src/schemas/game.ts` adds:

```ts
export const clientDiagPayloadSchema = z.object({
  type: z.string().max(64),
  data: z.unknown(),
});
```

## Sizing and disk budget

Rough envelope:

- 100 concurrent games × 10 events/s × 200 B = ~200 KB/s peak.
- Average 20 games / day, 15-min game = 9000 events × 200 B = 1.8 MB per
  game.
- 30 days × 20 games × 1.8 MB = ~1.1 GB.
- Mounted to `./data/debug-logs` on the VPS. Acceptable.

## Privacy

- File contains roles, votes, mafia targets — same secrets we already store
  in `GameEvent`. Admin-only access matches the existing event-log surface
  area.
- Client-pushed diag entries strip cookies / tokens at the schema layer
  (`z.string().max(64)` for `type`, `z.unknown()` for `data` — we do NOT
  unwrap `data`, so we'd never accidentally serialise a token. The
  frontend only ever calls `pushDiag` with safe shapes.)

## Testing

- Backend unit: `appendDebugLog` happy path (file created, one line, valid
  JSON), error path (write failure swallowed), concurrent appends preserve
  ordering within a game (two `await`-chained calls land in correct order).
- Backend integration: `persistEvent` end-to-end writes a `game` entry;
  `syncMediaPermissions` end-to-end writes a `media` entry; the HTTP
  endpoint returns the file content for an admin and 403 for a non-admin.
- No new frontend tests; the diag push is fire-and-forget and validated
  on the server.

## Open questions

None. Spec is ready for implementation planning.
