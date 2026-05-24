# Architecture

High-level map of online-mafia. Open this first when you join the project.

## Repo layout

```
packages/
  shared/      Types, zod schemas, constants (roles, phases, lobby limits).
               Pure TypeScript — no runtime deps on backend/frontend.
  backend/    Fastify HTTP + Socket.IO + Prisma + LiveKit server SDK.
  frontend/   React 19 + Vite + Zustand + react-query + LiveKit React SDK.
docs/         You are here.
infra/        Caddyfile (TLS / reverse proxy) + livekit.yaml.
docker-compose.{yml,prod.yml}
prisma/       (inside backend) schema + migrations
```

The three packages are **strictly layered**:

```
shared ← backend
shared ← frontend
```

Backend and frontend never import from each other directly. Anything they
both need (event names, role constants, payload shapes) lives in
`@mafia/shared` and is consumed as an npm workspace package.

## Runtime topology

```
                 ┌──────────────────┐
   browser  ───▶ │  Caddy (TLS)     │ ──▶  online-mafia.com  (SPA)
   browser  ───▶ │                  │ ──▶  api.online-mafia.com  (Fastify)
   browser  ───▶ │                  │ ──▶  livekit.online-mafia.com (LiveKit signal+TURN)
                 └──────────────────┘
                          │
                          ▼
                 ┌───────────────────────────┐
                 │  Docker on a single VPS    │
                 │                            │
                 │  ┌──────────┐  ┌───────┐   │
                 │  │ backend  │  │ redis │   │
                 │  └──────────┘  └───────┘   │
                 │  ┌──────────┐  ┌────────┐  │
                 │  │ frontend │  │postgres│  │
                 │  └──────────┘  └────────┘  │
                 │  ┌────────────┐            │
                 │  │  livekit   │            │
                 │  └────────────┘            │
                 └────────────────────────────┘
```

Scale target is **≤ 100 simultaneous tables** on a single VPS — no
clustering, no multi-region. Memory work (game state, lobby chat) lives in
the backend process; durable state (users, lobbies, game events) in
Postgres.

## Data flow

### Lobby

```
client (frontend)  ──REST──▶  POST /api/v1/lobby      (create)
client             ──REST──▶  POST /api/v1/lobby/:id/join
client             ──WS────▶  client:lobby_join       (subscribe to broadcasts)
backend            ──WS────▶  server:lobby_updated    (push on every change)
```

REST is the source of truth for the initial state and for mutations.
Socket pushes are how everyone else in the room learns about it. The
frontend's React Query cache is updated both by `setQueryData` on
`LOBBY_UPDATED` push and by invalidation on socket reconnect — so a
transient drop never leaves stale data.

### Game

The full game state is held in a single Map in the backend process
(`game.registry.ts`). Every judge / player action goes through:

```
client  ──WS──▶  client:judge_advance_phase (or vote, foul, …)
backend       │  resolve in pure engine (game.engine.ts → applyXxx)
              ▼
              persist GameEvent row in Postgres
              ▼
              update in-memory state
              ▼
backend ──WS─▶  server:game_state_delta  → every socket in the room
```

The engine is **pure** — every action is a `(state, input) → state | error`
function. Side effects (DB writes, broadcasts, LiveKit permission updates)
live in `game.service.ts`. This is why the engine has 75 unit tests and
the service has integration coverage instead — the boundary is sharp.

## Media

Video and audio are handled by **LiveKit** as a separate cluster. The
backend issues short-lived JWT tokens (30 min) per game; the LiveKit
server doesn't know about the game state at all — visibility and audio
gating are enforced **per-viewer client-side** in `media-visibility.ts`,
with publish permissions revoked on the server when a player is removed.

See [media.md](./media.md) for the full rules.

## Authentication

- Local accounts: email + Argon2id password (OWASP params).
- Google OAuth via `arctic` + PKCE.
- Session: HTTP-only JWT cookie. `tokenVersion` field on the user row
  lets logout / delete revoke all sessions at once.
- Socket auth re-checks `tokenVersion` every 5 minutes.

See [auth.md](./auth.md) for details.

## Persistence

- **Postgres** — users, lobbies, lobby members, games, game events,
  game participants. Migrations under
  `packages/backend/prisma/migrations/*`.
- **Redis** — currently unused (reserved for cross-instance pub/sub when
  scaling beyond one VPS).
- **In-memory** — active game state, lobby chat buffer, in-flight LiveKit
  registries.

## Reading order for newcomers

1. This file.
2. [game-engine.md](./game-engine.md) — the heart of the product.
3. [lobby.md](./lobby.md) — how a table assembles.
4. [media.md](./media.md) — why audio is per-viewer and what the
   judge-listen toggle does.
5. [auth.md](./auth.md) — only if you're touching auth.
