# Multi-stage build for the @mafia/backend service.
# Build context must be the monorepo root so workspaces can be installed together.

FROM node:22-alpine AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- deps: install all dependencies (incl. devDeps) for the build ----
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/backend/package.json  packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript to dist/ ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
# Shared must compile to dist/ first — backend imports it as `@mafia/shared`,
# and the package's exports field points at ./dist at runtime.
RUN pnpm --filter @mafia/shared build
WORKDIR /app/packages/backend
RUN pnpm prisma generate
RUN pnpm run build

# ---- prod-deps: install only production dependencies ----
FROM base AS prod-deps
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/backend/package.json  packages/backend/package.json
RUN pnpm install --frozen-lockfile --prod --filter=@mafia/backend... --filter=@mafia/shared

# ---- runner: minimal final image ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Non-root user — never run Node as root.
RUN addgroup -S mafia && adduser -S mafia -G mafia

# Copy the built backend, the shared package source (resolved at runtime via workspace),
# and the production node_modules.
COPY --from=prod-deps /app/node_modules                   ./node_modules
COPY --from=prod-deps /app/packages/backend/node_modules  ./packages/backend/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=build     /app/packages/backend/dist  ./packages/backend/dist
COPY --from=build     /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=build     /app/packages/shared/dist   ./packages/shared/dist
COPY --from=build     /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build     /app/packages/backend/package.json ./packages/backend/package.json
COPY pnpm-workspace.yaml package.json ./

USER mafia
EXPOSE 3000
WORKDIR /app/packages/backend
# `db:migrate:deploy` should be run as a one-off task before the app boots,
# not inside the runtime container. See infra/deploy.md.
CMD ["node", "dist/index.js"]
