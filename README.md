# Habit & Activity Tracking

CPE334 pair project — Sprint 1 skeleton. React (Vite + TypeScript) frontend, Express + TypeScript
backend, Prisma ORM, PostgreSQL.

## Prerequisites

- Node.js 20+ and npm
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

Fill in real values in `.env` (never commit this file). It is read by the backend from the
repo root and provides `DATABASE_URL`, `DATABASE_URL_TEST`, `SESSION_SECRET`, `PORT`, and the
seed script passwords.

## 3. Start a local PostgreSQL (optional, via Docker)

```bash
docker compose up -d
```

This starts a dev Postgres on `localhost:5432` matching the defaults in `.env.example`. Create
the test database once (same instance, separate database):

```bash
docker compose exec db createdb -U habit habit_tracker_test
```

## 4. Run migrations

```bash
cd backend
npm run db:migrate
```

## 5. Seed the database

```bash
npm run db:seed
```

Creates one manager and two participant accounts using the `SEED_PASSWORD_*` values from `.env`.

## 6. Run the apps

```bash
# backend (http://localhost:4000)
cd backend && npm run dev

# frontend (http://localhost:5173)
cd frontend && npm run dev
```

## 7. Run tests

```bash
cd backend && npm test
```

Runs the backend Vitest suite once against `DATABASE_URL_TEST`, resetting only the test
database between runs. The frontend has no tests yet in Sprint 1.

## Branching & PR workflow

- `main` is protected after initial setup — no direct pushes.
- `sprint-1-staging` is the integration branch for this sprint.
- All work starts from a GitHub Issue, then a feature branch cut from `sprint-1-staging`
  (e.g. `feature/f-01-auth`).
- Open a PR into `sprint-1-staging`; the other teammate reviews and approves before merge.
- `sprint-1-staging` is merged into `main` at the end of the sprint.
- Every feature gets its contract and failing tests written first, then the implementation.
