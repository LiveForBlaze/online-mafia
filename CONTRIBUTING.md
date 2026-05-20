# Contributing to online-mafia

Welcome! This document covers the local setup, code style, and process for
submitting changes.

## Local setup

Prerequisites: **Node 22+**, **pnpm 10+**, **Docker** (for Postgres / Redis /
LiveKit).

```bash
git clone https://github.com/YOUR_ORG/online-mafia
cd online-mafia
pnpm install
cp .env.example .env             # placeholders are fine for local dev
docker compose up -d             # start Postgres + Redis + LiveKit
pnpm --filter @mafia/backend db:push   # apply the Prisma schema
pnpm dev                         # backend on :3000, frontend on :5173
```

Open http://localhost:5173 and register a new account.

## Project structure

```
packages/
  shared/      # Constants, zod schemas, types shared between backend and frontend
  backend/     # Fastify + Prisma + Socket.IO + LiveKit
  frontend/    # React + Vite + Tailwind + LiveKit React SDK
```

- `shared` is the single source of truth for any type or constant used on
  both sides of the wire (phase names, role enums, schemas).
- `backend` is a modular monolith: `modules/auth`, `modules/lobby`,
  `modules/game`. Each module owns its routes, service, gateway (Socket.IO),
  events, and migrations.
- `frontend` is feature-organised under `src/features/` plus shared UI in
  `src/components/ui/`.

## Code style

- **TypeScript strict mode** is required (`noUncheckedIndexedAccess` included).
  Don't reach for `as any` — find a typed solution.
- All code and code comments are written in **English** (UI strings live in
  `messages.ts` per feature).
- Run `pnpm run format` before committing. Prettier config is in
  `.prettierrc`.
- Run `pnpm run typecheck` before opening a PR.
- Add tests for any non-trivial change. The game engine in
  `packages/backend/src/modules/game/game.engine.ts` is pure and easy to test
  with Vitest.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — the
prefix matters for the (eventual) automated changelog. Examples:

```
feat(game): implement last word phase after a vote-out
fix(lobby): prevent self-nomination during day_speech
docs: clarify the deployment env vars
test(game.engine): cover the tie revote path
```

## Pull request workflow

1. Fork and create a topic branch (`feat/last-word`, `fix/race-condition`).
2. Push and open a PR against `main`.
3. Make sure CI is green (typecheck, tests, build).
4. Describe the change, link any related issue, include screenshots for UI
   changes.
5. A maintainer reviews. Squash-merge into `main`.

## Game rule decisions

Sport mafia is played under multiple federation rulesets (FIIM, FSM, KSM,
etc.). Our platform is intentionally apolitical — anything ruleset-specific
should be a configurable option, not hard-coded. When in doubt, surface the
rule as a constant in `packages/shared/src/constants/` and document the
default in a comment.

## Reporting bugs

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Browser / device for UI bugs

Security issues: see `SECURITY.md`.
