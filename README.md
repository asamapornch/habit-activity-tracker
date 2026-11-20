# Habit & Activity Tracking

CPE334 pair project — Sprint 1 skeleton. React (Vite + TypeScript) frontend, Express + TypeScript
backend, Prisma ORM, PostgreSQL.

## Prerequisites

- Node.js 22+ and npm (Vitest 5 uses `Map.groupBy`, which Node 20 lacks: on Node 20 the test
  reporter crashes with `Map.groupBy is not a function` whenever a test fails)
- Docker (for the local dev PostgreSQL via `docker-compose`) — or your own PostgreSQL instance

## 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in real values in `.env` (never commit this file). It is read by both the backend and the
frontend from the repo root (the frontend's `vite.config.ts` points `envDir` here, so there is one
shared `.env`, not a separate one per app). It provides:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dev database connection |
| `DATABASE_URL_TEST` | Separate database used only by the backend test suite |
| `SESSION_SECRET` | Signs the session cookie; the backend refuses to start if this is empty |
| `PORT` | Backend HTTP port |
| `FRONTEND_ORIGIN` | Exact origin the frontend is served from; CORS allows only this origin (no wildcard). The backend refuses to start if this is empty |
| `VITE_API_URL` | Base URL the frontend uses to call the backend API |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | `docker-compose` dev Postgres credentials and host port |
| `SEED_PASSWORD_MANAGER` / `SEED_PASSWORD_PARTICIPANT_1` / `SEED_PASSWORD_PARTICIPANT_2` | Seed script passwords |

Example values for local development:

```bash
DATABASE_URL="postgresql://habit:habit@localhost:5432/habit_tracker"
DATABASE_URL_TEST="postgresql://habit:habit@localhost:5432/habit_tracker_test"
SESSION_SECRET="replace-with-a-long-random-string"
PORT=4000
FRONTEND_ORIGIN="http://localhost:5173"
VITE_API_URL="http://localhost:4000"
```

**Port note:** if port `5432` (Postgres), `4000` (backend) or `5173` (frontend) is already taken by
something else on your machine, change `POSTGRES_PORT` (and the port in `DATABASE_URL`/
`DATABASE_URL_TEST`), `PORT`, or pass `--port` to `vite`/`vite dev` — and update `FRONTEND_ORIGIN`
and `VITE_API_URL` to match whatever ports you actually end up running on, or login will fail CORS.

## 3. Start a local PostgreSQL (optional, via Docker)

```bash
docker compose up -d db
```

This starts a dev Postgres on `localhost:5432` (or `POSTGRES_PORT` if you overrode it) matching the
defaults in `.env.example`. Create the test database once (same instance, separate database):

```bash
docker compose exec db createdb -U habit habit_tracker_test
```

## 4. Run migrations

```bash
cd backend
npm run db:migrate
```

This applies migrations to `DATABASE_URL` (the dev database) only. The test suite uses a
**separate** database (`DATABASE_URL_TEST`), which `db:migrate`'s interactive `prisma migrate dev`
does not touch — migrate it too, once, with:

```bash
DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
```

(run with the same `.env` sourced into your shell, e.g. `set -a && source ../.env && set +a`
first, or substitute the real `DATABASE_URL_TEST` value from your `.env`).

## 5. Seed the database

```bash
npm run db:seed
```

Creates one manager and two participant accounts using the `SEED_PASSWORD_*` values from `.env`.
Re-running this after changing `SEED_PASSWORD_*` does **not** update an already-seeded account's
password (it's an upsert that only fills in missing rows) — delete the existing rows first if you
need to rotate a seeded password locally.

## 6. Run the apps

```bash
# backend (http://localhost:4000, or your PORT)
cd backend && npm run dev

# frontend (http://localhost:5173, or wherever Vite picks if that port is busy)
cd frontend && npm run dev
```

Open the frontend URL in a browser; it calls the backend at `VITE_API_URL` with
`credentials: "include"`, so `FRONTEND_ORIGIN` must match the frontend's actual origin exactly.

## 6b. Or run the whole app in Docker (closer to production)

```bash
docker compose up --build
```

Builds the root `Dockerfile` and starts it alongside `db`, serving the built frontend and the API
from one container on <http://localhost:3000> (single origin — see
`docs/labs/lab-05/docker-ci.md`). The `app` service's env vars in `docker-compose.yml` are
clearly-fake local values, not real secrets. First time only, apply migrations and seed it (same
dummy `SEED_PASSWORD_*` pattern as above):

```bash
docker compose exec -e SEED_PASSWORD_MANAGER=dev -e SEED_PASSWORD_PARTICIPANT_1=dev \
  -e SEED_PASSWORD_PARTICIPANT_2=dev app sh -c "npx prisma migrate deploy && npm run db:seed"
```

## 7. Run tests

```bash
cd backend && npm test
cd frontend && npm test
```

`backend`'s suite runs once (Vitest + Supertest) against `DATABASE_URL_TEST`, resetting the test
database before every test; spec files run one at a time (`fileParallelism: false`) since they
share that one database. `frontend`'s suite runs once (Vitest + React Testing Library) with `fetch`
mocked — it needs no backend or database running.

**Expected result on `sprint-1-staging` right now:** the whole backend suite passes (152 tests,
including all 23 F-05 access-control tests), and the whole frontend suite passes. Any failing test is
a real regression.

## Branching & PR workflow

- `main` is protected after initial setup — no direct pushes.
- `sprint-1-staging` is the integration branch for this sprint.
- All work starts from a GitHub Issue, then a feature branch cut from `sprint-1-staging`
  (e.g. `feature/f-01-auth`).
- Open a PR into `sprint-1-staging`; the other teammate reviews and approves before merge.
- `sprint-1-staging` is merged into `main` at the end of the sprint.
- Every feature gets its contract and failing tests written first, then the implementation.
