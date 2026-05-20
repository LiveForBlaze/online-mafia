# Online Mafia

Open source platform for online sport mafia — apolitical, accessible to everyone, no federation gatekeeping.

> ⚠️ Early development. The project is being scaffolded.

## What is this

A web-based platform where 10 players plus 1 judge can play sport mafia (classic 6/1/2/1 setup) with built-in WebRTC video and audio. The platform is designed to be open and welcoming for both newcomers and competitive players.

## Tech stack

- **Backend**: Node.js 22+, TypeScript, Fastify, Socket.IO, Prisma (PostgreSQL), Redis, LiveKit
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, shadcn/ui, LiveKit React SDK
- **Shared**: zod schemas, TypeScript types, ruleset configs as YAML
- **Local infra**: Docker Compose (PostgreSQL, Redis, LiveKit, coturn)

## Project structure

```
.
├── packages/
│   ├── shared/      # Shared types, zod schemas, constants, ruleset configs
│   ├── backend/     # Node.js + Fastify + Socket.IO
│   └── frontend/    # React + Vite
├── docker-compose.yml
└── docs/
```

## Local development

Prerequisites: Node 22+, pnpm 10+, Docker.

```bash
# Install dependencies
pnpm install

# Start local services (PostgreSQL, Redis, LiveKit)
docker compose up -d

# Run backend and frontend in dev mode
pnpm dev
```

Backend will be available at `http://localhost:3000`, frontend at `http://localhost:5173`.

## Contributing

This project is open source under the MIT license. Contributions are welcome — see `CONTRIBUTING.md` (coming soon).

## License

MIT. See [LICENSE](./LICENSE).
