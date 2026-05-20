# Deploying online-mafia to a single VPS

This guide deploys the full stack (backend, frontend, Postgres, Redis, LiveKit,
Caddy reverse proxy) to one Hetzner-style VPS using Docker Compose.

## Prerequisites

- A VPS with Docker and Docker Compose installed
- A domain pointing to the VPS (`mafia.example.com`, `api.mafia.example.com`)
- ~2 GB free RAM, ~10 GB disk

## Steps

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_ORG/online-mafia
cd online-mafia
cp .env.example .env
# Edit .env — replace every CHANGE_ME placeholder with a real secret.
# Generate secrets with:
#   openssl rand -base64 48   # JWT_SECRET
#   openssl rand -base64 32   # LIVEKIT_API_SECRET
#   openssl rand -hex 24      # POSTGRES_PASSWORD
```

### 2. Build images

```bash
docker compose -f docker-compose.prod.yml build
```

### 3. Apply migrations

This step is **mandatory before the first run** and after every schema change.
Never use `db:push` in production.

```bash
docker compose -f docker-compose.prod.yml run --rm backend \
  pnpm prisma migrate deploy
```

### 4. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

Caddy auto-provisions Let's Encrypt certificates. First boot takes ~30
seconds for DNS challenges to complete.

### 5. Daily backups

```bash
# Add to crontab (`crontab -e`):
0 4 * * * /opt/online-mafia/scripts/backup.sh >> /var/log/mafia-backup.log 2>&1
```

The script is idempotent and prunes local copies older than 14 days. Configure
`RCLONE_REMOTE` if you also want offsite copies.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm backend pnpm prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d
```

Caddy zero-downtime restarts the backend; LiveKit and Postgres stay up the whole time.

## Rolling back

```bash
git checkout <previous-tag>
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
# Note: only roll back if there are no incompatible migrations between the
# two versions. Otherwise restore from `scripts/backup.sh` output first.
```

## Monitoring

- `docker compose logs -f backend` — application logs (pino JSON in prod)
- `docker compose logs -f livekit` — LiveKit SFU logs
- Configure UptimeRobot (or similar) to ping `https://api.mafia.example.com/health/ready`

## Known caveats on a €8 VPS

- LiveKit on a single 2-vCPU VPS handles ~5–10 simultaneous tables comfortably.
  Beyond that, split LiveKit to a dedicated host or use LiveKit Cloud.
- Postgres + Redis + LiveKit + backend on one machine competes for CPU during
  video bursts. Watch `docker stats` under load.
