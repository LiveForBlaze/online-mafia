# Security policy

## Reporting a vulnerability

If you believe you have found a security issue in online-mafia, please **do not
open a public GitHub issue**. Instead, email the maintainer with details:

> security@example.com _(replace with the project maintainer's address)_

A maintainer will acknowledge within 72 hours and propose a disclosure
timeline. We do not pay bug bounties at this stage, but we will credit
researchers in release notes if they wish.

## What's in scope

- Authentication and session handling
- Cookie / JWT issuance and validation
- OAuth (Google) flow
- Authorization checks on REST and Socket.IO endpoints
- Information leaks across roles (a civilian seeing mafia at night, etc.)
- LiveKit token issuance and permission enforcement
- SQL injection, XSS, CSRF, SSRF
- Denial of service vectors (especially around argon2 and LiveKit)

## What's not in scope

- Issues that require physical access to a user's device
- Best-practice "missing header" reports without a concrete attack
- Vulnerabilities in third-party dependencies that are not yet exploitable
  through our code surface (please file upstream)

## Deployment checklist (host responsibilities)

Before opening the platform to the public, the operator MUST:

1. Replace every `CHANGE_ME_*` placeholder in `.env` with strong random values.
   - `JWT_SECRET`: `openssl rand -base64 48`
   - `LIVEKIT_API_SECRET`: `openssl rand -base64 32`
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24`
2. Set `NODE_ENV=production`. The backend refuses to start in production with
   placeholder secrets.
3. Use HTTPS for `PUBLIC_BACKEND_URL` and `wss://` for `LIVEKIT_URL`.
4. Run Postgres and Redis on `127.0.0.1` or behind a private network — never
   publish 5432 / 6379 to the internet.
5. Configure LiveKit production mode (not `--dev`) with TURN/TLS so players
   behind NAT can reach the SFU.
6. Enable a rate limiter at the reverse proxy in addition to the in-process
   limit (defense in depth).
7. Schedule daily Postgres backups (`scripts/backup.sh`) to offsite storage.

## Threat model

- **Cheating players** are the primary adversary. They may inspect their own
  client (DevTools, modified bundle, intercepted WebSocket) to learn secrets
  they should not know (other players' roles, night actions).
  - **Mitigation**: server-side state projection (`projectFor`) only sends
    role-aware data; LiveKit `canPublish` is revoked per phase via the Admin
    API so secret-phase video and audio never reach unauthorised clients.
- **Bot / DoS traffic** targeting `/auth/*` (especially `/login` which runs
  argon2id at 19 MB per attempt) and `/lobby/:id/join` (also argon2).
  - **Mitigation**: `@fastify/rate-limit` at the application layer; reverse
    proxy rate limit recommended on top.
- **Account takeover via OAuth account linking**: an attacker registers a
  victim's email with a password, then the victim signs in with Google
  expecting a new account.
  - **Mitigation**: linking a Google profile to an existing local user with
    `emailVerified === false` is refused; the user is asked to log in with
    the existing password (or recover it) first.
