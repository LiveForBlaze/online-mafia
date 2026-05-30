# online-mafia — project guide

Open-source platform for online sport mafia. Node.js + TypeScript monorepo (pnpm workspaces).

## Layout

- `packages/backend` — Fastify, Socket.io, Prisma, Postgres, Redis, LiveKit server SDK, XState game engine, argon2, JWT via `@fastify/jwt`, OAuth via `arctic`
- `packages/frontend` — React 19, Vite, Tailwind 4, Zustand, react-query, react-router 7, LiveKit components
- `packages/shared` — Zod schemas, constants, types (no Node-only deps)

## Hard rules

- Do what was asked — nothing more, nothing less
- Prefer editing existing files. Don't create files unless necessary
- Don't create docs / READMEs unless explicitly requested
- Never save scratch files or tests to repo root — use `packages/*/src`, `tests/`, `docs/`, `scripts/`
- Always read a file before editing
- Never commit secrets, credentials, or `.env*` files
- Keep files under 500 lines (current violations: `game.engine.ts` 1447, `game.service.ts` 1046, `UserPage.tsx` 901, `lobby.service.ts` 603, `auth.service.ts` 557 — split when touching them)
- Validate input at system boundaries (zod schemas in `packages/shared/schemas`)
- Run `pnpm run format` before committing — CI gates on `format:check`

## Build & test

```bash
pnpm install                                   # at repo root
pnpm --filter @mafia/shared build              # shared must be built before typecheck
pnpm --filter @mafia/backend db:generate       # prisma client
pnpm run typecheck                             # all 3 packages
pnpm run test                                  # vitest, backend has 96 tests
pnpm run build                                 # all 3 packages
pnpm run format:check                          # prettier
```

Frontend tests currently use `--passWithNoTests` (silent green). Real frontend tests are a known gap.

## Deployment

- CI: `.github/workflows/ci.yml` — lint/typecheck/test/build, then SSH deploy to VPS on push to `main`
- Prod: `ssh root@89.167.60.120`, `/opt/online-mafia`, docker-compose
- DB migrations on prod: `docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy`
- Prisma recovery from P3018: `migrate resolve --rolled-back` (procedure in auto-memory)

## Security notes

- JWT secret guarded by env check in `packages/backend/src/config/env.ts`
- argon2id parameters in `packages/backend/src/lib/password.ts`
- OAuth state + PKCE flow correctly implemented in `auth.routes.ts`
- LiveKit identity is server-assigned (see `game.livekit.ts`) — never trust client-provided identity
- AI moderation (Haiku) is fail-open; 50/day per-user rate-limit on lobby creation
- Pino redact paths in `lib/logger.ts` — add new sensitive fields here when introducing them

## Architecture quirks (intentional, not bugs)

- Per-user state projection: `broadcastGameState` emits one `GAME_STATE_DELTA` per socket with role-specific projection. Can't use `io.to(room).emit(state)` because each player sees different info. See comment at `game.gateway.ts:9`.
- LiveKit publish is never revoked; subscribe-side filtering only. Known gap documented in auto-memory.
- Game state is XState; the source of truth lives in the state machine + `GameEvent` append-only log. Don't mutate state outside the machine.

## Background

- Mass-market product, not for elite players
- Scale target: max 100 concurrent tables, single VPS, no HA/multi-region
- No video recording — replay is reconstructed from event log
- License: MIT, English in code/docs
