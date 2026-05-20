# Multi-stage build for the @mafia/frontend SPA.
# Final image is just nginx serving the built static assets.

FROM node:22-alpine AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json   packages/shared/package.json
COPY packages/backend/package.json  packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend
# Shared package's exports field points at ./dist — build it before the frontend
# bundles its imports of `@mafia/shared`.
RUN pnpm --filter @mafia/shared build
# Build-time env: must be baked into the bundle at build time (Vite inlines VITE_*).
# Override at build with --build-arg VITE_BACKEND_URL=https://api.example.com etc.
ARG VITE_BACKEND_URL=http://localhost:3000
ARG VITE_LIVEKIT_URL=ws://localhost:7880
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
WORKDIR /app/packages/frontend
RUN pnpm run build

FROM nginx:alpine AS runner
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
