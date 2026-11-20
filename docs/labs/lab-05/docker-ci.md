# Lab 5 — Dockerfile and CI

What each new file does, in plain English, and the environment variables involved.
No values are included anywhere in this doc or in the files themselves — only
names and where each one comes from.

## `Dockerfile` (repo root)

Multi-stage build producing **one** image that serves both the API and the
built frontend from a single Express process on a single origin:

1. **`frontend-build`** stage: `npm ci` + `npm run build` for `frontend/`,
   producing static files in `frontend/dist`. `VITE_API_URL` is deliberately
   left unset here — `frontend/src/api.ts` then defaults it to `""`, so the
   bundled frontend calls the API with relative paths (`/auth/login`, not
   `http://somewhere/auth/login`), which is what same-origin production needs.
2. **`backend-build`** stage: `npm ci` (this also runs the backend's own
   `postinstall`, `prisma generate`) then `npm run build` (`tsc`, emitting
   `backend/dist`). Installs `python3`/`make`/`g++` (bcrypt is a native
   module and may need to compile from source) and `openssl` — `node:*-slim`
   doesn't ship the latter, but Prisma's engine-detection at `generate` time
   needs it to pick the right OpenSSL target; without it, a Debian
   Bookworm/OpenSSL-3 image got engines built for OpenSSL 1.1.x instead,
   which fail to load at runtime (found while verifying this image —
   evidence 16).
3. **Final stage**: copies the backend-build output (including its
   `node_modules`, which keeps devDependencies — see below) and the
   frontend's built `dist/`, installs `openssl` again (the generated Prisma
   engine binary needs it at runtime too), runs as the `node` user the
   official image already ships (not root), and starts with `node
   dist/server.js`.

**Why devDependencies are kept, not pruned:** the same image also runs the
Cloud Run *migration job* — `cd backend && npx prisma migrate deploy && npm
run db:seed` — which needs the `prisma` CLI and `tsx` (both devDependencies).
Rather than reorganize `package.json`'s dependency lists, the final stage
just keeps the full `node_modules` from the build stage.

## `.dockerignore`

Keeps `.git`, all `node_modules`, any pre-built `dist/`, `.env*` (including
`.env.example` — the image needs no sample file, only real env vars at
runtime), `docs/` (including the evidence files), and the backend/frontend
test files out of the build context. Nothing here is copied into the image
regardless, since the Dockerfile's `COPY` steps name specific paths — this
also just keeps the context small and the image free of dev-only files.

## `docker-compose.yml` (updated)

Added an `app` service (build: this Dockerfile) alongside the existing `db`
service. `db` gained a healthcheck so `app`'s `depends_on: condition:
service_healthy` actually waits for Postgres to accept connections, not just
for its container to start. `docker compose up -d db` (the existing
test-database workflow) is unaffected — nothing about `db`'s image, ports, or
credentials changed. `app`'s env vars are clearly-fake local values; see
README §6b for how to run it and apply the one-time migration/seed.

## `.github/workflows/ci-docker.yml`

One job, `test-and-docker` (name required exactly — a future deploy workflow
will call this one via `workflow_call`, and branch protection will require it
by name):

1. Starts a throwaway `postgres:16` service container.
2. Creates a second database on it (`habit_tracker_test`, alongside the
   service's own `habit_tracker`) — `tests/setup.ts` refuses to run if
   `DATABASE_URL` and `DATABASE_URL_TEST` are equal, as a guard against a
   test run wiping a real dev database by accident, so CI needs two distinct
   values even though both just point at the one throwaway container.
3. `npx prisma migrate deploy` against the test database, backend
   `typecheck`, backend `test`, frontend `test`.
4. `docker build` of the root `Dockerfile` — no push, just confirming the
   image this repo ships still builds.

Triggers: `pull_request` into `sprint-1-staging` or `main`, `push` to
`sprint-1-staging`, and `workflow_call` (for the future deploy workflow to
reuse). `permissions: contents: read` only.

**Action pins:** `actions/checkout` and `actions/setup-node` are pinned to a
full commit SHA (with a version comment), verified directly against
`repos/{owner}/{repo}/tags` on the GitHub API (`gh api repos/actions/checkout/tags`
and `repos/actions/setup-node/tags`) — not invented, not scraped from a
third-party page.

## `.github/dependabot.yml`

Weekly update checks for GitHub Actions (root) and npm (`backend/` and
`frontend/` separately, since they're two independent `package.json`s).

## Environment variables

| Variable | Purpose | Where it comes from in the cloud |
| --- | --- | --- |
| `PORT` | HTTP port the app listens on | Set automatically by Cloud Run; the image's own `ENV PORT=3000` is only the local/default fallback |
| `DATABASE_URL` | Postgres connection the app (and the migration job's Prisma CLI) uses | Secret Manager secret, injected into the Cloud Run service and the migration job |
| `DATABASE_URL_TEST` | Separate database for the backend test suite only | CI's own throwaway Postgres service container; not used in production at all |
| `SESSION_SECRET` | Signs the session cookie; app refuses to start if empty | Secret Manager secret |
| `FRONTEND_ORIGIN` | CORS allow-list origin; app refuses to start if empty | Set to the Cloud Run service's own URL (single-origin deployment — see `cloud-ready-contract.md` item 5) |
| `FRONTEND_DIST_PATH` | Overrides where Express looks for the built frontend | Not set in Cloud Run — the image's default already matches where this Dockerfile places the build; used to override for local tests/fixtures only |
| `NODE_ENV` | `production` enables the session cookie's `Secure` flag (together with `trust proxy`) | Baked into the image (`ENV NODE_ENV=production`); `docker-compose.yml`'s local `app` service overrides it to `development`, since there's no TLS-terminating proxy locally the way Cloud Run provides one |
| `SEED_PASSWORD_MANAGER` / `SEED_PASSWORD_PARTICIPANT_1` / `SEED_PASSWORD_PARTICIPANT_2` | Seed script's demo account passwords | Secret Manager secrets, passed only to the one-off migration job, never to the running service |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `docker-compose`'s local Postgres container | Local dev only — Cloud SQL itself is provisioned separately (course portal/TA), not by these vars |
| `VITE_API_URL` | Optional build-time base URL for the frontend's API calls | Intentionally left unset in the production Docker build, so compiled requests default to relative/same-origin paths |

No value for any of these appears in this document, in the Dockerfile, in
`docker-compose.yml`, or in `ci-docker.yml` — only placeholders (`.env.example`)
or throwaway CI-only fixture values scoped to a service container that stops
existing when the job ends.
