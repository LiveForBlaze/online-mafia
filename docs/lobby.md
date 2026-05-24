# Lobby lifecycle

A lobby is the waiting room where 10 players + 1 judge gather before a
game starts. This document is the truth about who can do what, when, and
what breaks if you skip a step.

## Identity

A lobby has:

- One **host** — the user who created it. Cannot be reassigned.
- One **judge** seat — by default the host. They run the game.
- 10 **player seats** (1–10).
- Bots can fill empty player seats (host-only «Заполнить ботами»).

The user-visible counter on cards is `playerCount / 10` — judge is not
counted as a player.

## States

```
WAITING   ← default after create
   │
   │ host clicks Start (after every player is ready)
   ▼
IN_GAME   ← a Game row is attached; lobby UI redirects to /game/:id
   │
   │ judge ends, host leaves, host close
   ▼
CLOSED    ← lobby disappears from lists, guests are bounced to /
```

`WAITING → CLOSED` directly (without a game) is fine — that's a host
deciding not to start.

## Mutations

| What                  | Endpoint                         | Notes                                                                            |
| --------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Create                | `POST /lobby`                    | Rate-limited 50/day per user. Auto-evicts the user from any other WAITING lobby. |
| Join (public)         | `POST /lobby/:id/join`           | Rate-limited 10/min. Same auto-evict.                                            |
| Join (private)        | same, with `{password}` body     | Argon2 verify. Rate-limit also guards CPU.                                       |
| Leave (player)        | `POST /lobby/:id/leave`          | Deletes the member row; broadcasts a fresh state.                                |
| Leave (host)          | `POST /lobby/:id/leave`          | Sets status=CLOSED, ends any in-progress game, kicks guests to /.                |
| Close (host explicit) | `DELETE /lobby/:id`              | Same as host leave + clears chat buffer.                                         |
| Set ready             | `POST /lobby/:id/ready`          | Players only. Host doesn't toggle ready (they're the one starting).              |
| Start game            | `POST /lobby/:id/start`          | Host-only. All 10 players ready, judge seated.                                   |
| Fill with bots        | `POST /lobby/:id/fill-bots`      | Host-only.                                                                       |
| Preassign role (dev)  | `POST /lobby/:id/preassign-role` | Host-only. Honored by `assignRoles` at game start.                               |
| Claim judge seat      | `POST /lobby/:id/claim-judge`    | Anyone in the lobby if the slot is empty.                                        |
| Kick                  | `POST /lobby/:id/kick`           | Host-only.                                                                       |

## Realtime

A `lobby:<id>` Socket.IO room mirrors the DB. Every successful mutation
calls `broadcastLobbyUpdate(lobbyId)` which pushes
`SERVER_EVENT.LOBBY_UPDATED { lobby: details }` to everyone in the room.

Client side (`useLobbyConnection.ts`):

- On mount / reconnect → emit `client:lobby_join` AND invalidate the
  React Query cache (covers «my socket was off, broadcasts went past me»).
- On `LOBBY_UPDATED` → `setQueryData` for instant re-render plus
  `invalidateQueries` as a safety net.
- On unmount → emit `client:lobby_leave` (socket-room only, doesn't
  remove the DB membership — that's what the REST endpoint is for).
- F5 / close-tab / app crash → server `disconnecting` handler resets
  `isReady=false` (so the host doesn't try to start with a ghost) and
  broadcasts; membership row stays so the player can come back.

## Auto-evict rule

A user can be a member of **at most one WAITING lobby** at a time. Both
`createLobby` and `joinLobby` enforce this by deleting non-host
memberships in other WAITING lobbies before the operation. Each affected
lobby gets its own broadcast so prior hosts see the seat free.

Why: without this, players who closed a tab on lobby A and joined lobby
B from a share link would be ghosts in lobby A.

## Files

| File                                                      | What's there                                   |
| --------------------------------------------------------- | ---------------------------------------------- |
| `backend/src/modules/lobby/lobby.service.ts`              | Create/join/leave/close + auto-evict.          |
| `backend/src/modules/lobby/lobby.gateway.ts`              | Socket handlers (room join, chat, disconnect). |
| `backend/src/modules/lobby/lobby.routes.ts`               | REST endpoints + rate-limits.                  |
| `backend/src/modules/lobby/lobby.broadcast.ts`            | `broadcastLobbyUpdate` per-viewer projection.  |
| `backend/src/modules/lobby/lobby.chat.ts`                 | In-memory chat ring buffer.                    |
| `backend/src/modules/lobby/lobby.bots.ts`                 | Bot user creation.                             |
| `backend/src/modules/lobby/lobby.mappers.ts`              | Prisma → API shape (no leak of passwordHash).  |
| `frontend/src/features/lobby/hooks/useLobbyConnection.ts` | Client-side socket wiring.                     |
| `frontend/src/features/lobby/hooks/useLobby.ts`           | React Query for lobby details (WS-driven).     |
| `frontend/src/features/lobby/pages/LobbyRoomPage.tsx`     | Room UI + auto-redirect on close.              |
