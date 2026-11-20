# syntax=docker/dockerfile:1
#
# Multi-stage build producing one image that serves the backend API and the
# built frontend from a single Express process on a single origin (see
# backend/src/lib/staticFrontend.ts). The same image also runs the Cloud Run
# migration job: `cd backend && npx prisma migrate deploy && npm run db:seed`
# — which is why the final stage keeps the backend's devDependencies (prisma
# CLI, tsx) instead of pruning to production-only.
#
# Debian/glibc base (not Alpine/musl): bcrypt is a native module and its
# prebuilt binaries target glibc.

ARG NODE_VERSION=22

# ---- frontend build -------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL is intentionally NOT set here: frontend/src/api.ts defaults it
# to "" when unset, producing relative-path fetches ("/auth/login", ...) —
# correct for same-origin production, and the only build-time setting that
# doesn't bake a dev-only URL into the bundle.
RUN npm run build

# ---- backend build ---------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS backend-build
# python3/make/g++: bcrypt falls back to compiling from source if no
# prebuilt binary matches this exact Node/arch (only needed in this stage).
# openssl: node:*-slim doesn't ship it, but Prisma's engine-detection at
# `generate` time needs it to find the right OpenSSL target — without it,
# `prisma generate` silently picks the wrong engine (e.g. openssl-1.1.x on a
# Bookworm/OpenSSL-3 image) and the generated client fails to load at
# runtime with an "engine not found" error.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/prisma ./prisma
# postinstall runs `prisma generate`, which needs prisma/schema.prisma —
# already copied above.
RUN npm ci
COPY backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
RUN npm run build

# ---- final image ------------------------------------------------------------
FROM node:${NODE_VERSION}-slim
# The Prisma query engine binary generated above is dynamically linked
# against libssl; node:*-slim doesn't ship it by default.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Cloud Run injects its own PORT; this is the local/default value the app
# listens on when nothing else sets one (e.g. `docker run` with no -e PORT).
ENV PORT=3000
# Explicit rather than relying on the default's directory-depth math (see
# backend/src/lib/config.ts): matches exactly where this image's final COPY
# below places the built frontend.
ENV FRONTEND_DIST_PATH=/app/frontend/dist
WORKDIR /app/backend
# Keeps devDependencies (prisma CLI, tsx) — the Cloud Run migration job runs
# `npx prisma migrate deploy && npm run db:seed` inside this same image.
COPY --chown=node:node --from=backend-build /app/backend ./
COPY --chown=node:node --from=frontend-build /app/frontend/dist /app/frontend/dist
# Official node images already ship a non-root "node" user (uid 1000).
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
