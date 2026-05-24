# Authentication & sessions

Two sign-in paths, one session model.

## Sign-in paths

### Local (email + password)

- Password is hashed with **Argon2id**, OWASP params:
  `memoryCost=19MB`, `timeCost=2`, `parallelism=1`.
- New accounts start with `emailVerified=false`. (Email verification is
  a stub today — the column is reserved for future SMTP integration.)
- Rate-limits: register 5/min, login 10/min per IP.

### Google OAuth

- `arctic` SDK for Google. Authorization-code flow with **PKCE**.
- Two HTTP-only temp cookies (`OAUTH_STATE`, `OAUTH_CODE_VERIFIER`)
  carry the CSRF state through the redirect. TTL 10 minutes, SameSite=Lax.
- Callback `GET /auth/google/callback`:
  - Verifies `state`, exchanges the code for tokens, fetches Google
    user info.
  - If a local account with that email exists and **isn't email-verified**,
    we refuse to link — a determined attacker could otherwise take over
    an account by signing up with a local password to a Gmail they don't
    own. This guard is deliberate.

## Session model

A successful login sets a **single HTTP-only JWT cookie** named
`mafia.session`. The JWT payload:

```ts
{
  sub: userId,
  nickname: string,
  v: tokenVersion  // monotonic counter on the user row
}
```

- `secure: true` and `sameSite: 'strict'` in production; `secure: false`
  in dev so localhost works.
- `httpOnly: true` always — JS in the browser cannot read it.

### Revocation

There's no separate refresh-token table. Revocation goes through
`tokenVersion` on the `User` row:

```ts
authenticate (HTTP)  → verify JWT → SELECT tokenVersion → match against jwt.v
socket handshake     → same check at connect time
socket periodic      → re-check every 5 minutes (recheck timer)
```

When `tokenVersion` is bumped, every outstanding JWT is dead within
≤5 minutes. We bump on:

- **Account delete** — `tokenVersion: { increment: 1 }`.
- Future-proof: any «sign out everywhere» action.

Plain logout (`POST /auth/logout`) just clears the cookie — it doesn't
bump `tokenVersion`, so other devices stay signed in. That's intentional
(don't kick the user off all their tabs because they tapped logout on a
phone).

## LiveKit token revocation

LiveKit JWT tokens are **bearer credentials** valid up to TTL (30 min,
see `LIVEKIT_TOKEN_TTL_SECONDS`). A cleared session cookie doesn't
invalidate them on its own — a stolen token could still join the LK
room until expiry.

To close the window:

- **Logout** → `revokeLiveKitForUser(sub)` is fired best-effort. For
  every active game the user is in we call
  `RoomServiceClient.removeParticipant(room, userId)`.
- **Account delete** → same call, also called after `tokenVersion`
  is bumped.

## Account deletion

Soft-delete with anonymisation:

- `email` → `deleted-<uuid>@deleted.local`
- `nickname` → `[удалён]`
- `passwordHash`, `googleSub`, `realName`, `country`, `club` → cleared
- `tokenVersion` bumped

Game history references the row, so we never hard-delete. The user can't
sign in again.

Argon2 verification of the supplied password is required before
deletion, mirroring login. Rate-limited 5/min.

## Files

| File                                       | What's there                               |
| ------------------------------------------ | ------------------------------------------ |
| `backend/src/modules/auth/auth.service.ts` | Register/login/delete/update flows.        |
| `backend/src/modules/auth/auth.routes.ts`  | REST endpoints + rate-limits + logout.     |
| `backend/src/modules/auth/auth.cookies.ts` | Cookie helpers (session + OAuth temp).     |
| `backend/src/modules/auth/google.ts`       | Arctic client + PKCE generation.           |
| `backend/src/plugins/security.ts`          | Fastify `authenticate` decorator.          |
| `backend/src/plugins/socketio.ts`          | Socket handshake + 5-min revocation check. |
