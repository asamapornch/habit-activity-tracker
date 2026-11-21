# Deployment

How this app runs in the cloud, in plain English. No secret values appear
anywhere in this document — only resource names and Secret Manager secret
*names*.

## Stack and changes from the reference

Our stack: **React/Vite** (frontend) + **Express/TypeScript** (backend) +
**Prisma** + **PostgreSQL**, built into a single container and deployed to
Cloud Run, with sessions stored in PostgreSQL and the database migrated/seeded
by a Cloud Run job — not the generic reference kit's assumed stack. Every
change made to adapt the course kit's `deploy/deploy.sh`, `deploy/release.sh`,
and `.github/workflows/deploy.yml` for this app:

- **Seed command**: `npm run db:seed` (our script, `backend/prisma/seed.ts`
  via `tsx`) instead of the kit's `npm run prisma:seed`.
- **Seed env vars**: the migration job gets `SEED_PASSWORD_MANAGER`/
  `_PARTICIPANT_1`/`_PARTICIPANT_2` (what our seed script actually reads),
  not the kit's `ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`; mapped unconditionally
  rather than gated behind `--demo`/`SEED_DEMO_DATA`, since our seed has no
  demo/non-demo branch.
- **Health/readiness paths**: our app exposes bare `/health` and `/ready`
  (see `backend/src/routes/health.ts` and `ready.ts`), not the kit's assumed
  `/api/health`/`/api/ready`.
- **`SESSION_SECRET` added**: the kit's service only had `DATABASE_URL`; our
  app refuses to start without a session secret too.
- **`FRONTEND_ORIGIN` added**: a plain env var, set to the service's own URL
  at deploy time — single container, single origin (see
  `cloud-ready-contract.md` item 5), not a separate frontend host the way a
  two-origin app would need.
- **`--update-env-vars`/`--update-secrets`** instead of the kit's
  `--set-env-vars`/`--set-secrets` everywhere, so a deploy can't silently
  wipe portal-managed config this script doesn't name (see "Rules" below).
- **Port 3000**, matching our Dockerfile, instead of the kit's placeholder
  port.
- **Branding and stale text**: every "TokTickIT" reference, the wrong
  `/api/health`/`/api/ready` URLs, a fake example admin email, and the
  dry-run summary's fake "Deployment Completed!" + placeholder URL (now an
  honest "DRY RUN: nothing was deployed.") were all specific to the generic
  kit or just wrong for this app.
- **Removed**: references to `deploy/tests/test_*_stub.sh` (don't exist in
  this repo) and the kit's claim that `deploy/deploy.sh` "creates" Cloud
  SQL/IAM/secrets (the course portal/TA pre-provisions all of it; see
  "Resource names" below).

## Architecture

One container, one Cloud Run service, one Cloud SQL (Postgres) instance,
region `asia-southeast1`, project `cpe-se-course-2026`, team prefix
`s65da36e2`.

- The root `Dockerfile` builds the frontend and backend into **one** image.
  At runtime, Express serves the built frontend as a single-page app and the
  API from the same process, on the same origin (see
  `docs/labs/lab-05/cloud-ready-contract.md` item 5 and `docs/labs/lab-05/docker-ci.md`).
- That one container is the Cloud Run **service** (`s65da36e2`) — the thing
  that actually serves traffic.
- A separate Cloud Run **job** (`s65da36e2-migrate`) runs the same image with
  its command overridden to apply database migrations and seed fixed demo
  accounts, instead of serving traffic. It runs once per deploy, before the
  service is updated.
- Sessions are stored in Cloud SQL too (`connect-pg-simple`, see contract doc
  item 1), not in the container's memory — Cloud Run can run several
  instances of the service, or replace an instance at any time, and a
  session pinned to one process's memory would break logins.
- Cloud SQL is reached over its Unix socket connection name
  (`cpe-se-course-2026:asia-southeast1:s65da36e2-pg`), not a public IP.

## Resource names

All resources use the team prefix `s65da36e2`. No secret values below — only
names.

| Resource | Name |
| --- | --- |
| Project | `cpe-se-course-2026` |
| Region | `asia-southeast1` |
| Cloud Run service | `s65da36e2` |
| Cloud Run migration job | `s65da36e2-migrate` |
| Cloud SQL instance | `s65da36e2-pg` |
| Database name / DB user | `s65da36e2` |
| Artifact Registry repo / image name | `s65da36e2` / `s65da36e2` |
| Service account (runs the service and the job) | `s65da36e2-runner@cpe-se-course-2026.iam.gserviceaccount.com` |

These — along with the Cloud SQL instance, the service account, Artifact
Registry, and the service/job's public IAM — are provisioned **once by the
course portal/TA**, not by anything in this repo. `deploy/deploy.sh` never
creates or modifies project-level IAM or infrastructure; see its own header
comment.

## Environment variables

| Variable | Purpose | Source |
| --- | --- | --- |
| `PORT` | HTTP port the app listens on | Plain env — Cloud Run sets this automatically; the image's own default (`3000`) matches `--port 3000` |
| `NODE_ENV` | `production` enables the session cookie's `Secure` flag (with `trust proxy`) | Plain env, set via `--update-env-vars` on both the service and the job |
| `TZ` | Process timezone (`Asia/Bangkok`) | Plain env, set via `--update-env-vars` on both the service and the job |
| `SEED_DEMO_DATA` | Historical flag from the course kit's `--demo` option | Plain env on the **job** only — our seed script (`backend/prisma/seed.ts`) has no demo/non-demo branch, so this currently has no effect on what gets seeded; kept for compatibility with the kit's `--demo` CLI flag, not acted on by our app |
| `FRONTEND_ORIGIN` | CORS allow-list origin; app refuses to start if empty | Plain env on the **service** only, set to the service's own URL (single-origin deployment — see contract doc item 5) |
| `DATABASE_URL` | Postgres connection, used by both the app and the migration job's Prisma CLI | Secret Manager secret `s65da36e2-database-url`, on both the service and the job |
| `SESSION_SECRET` | Signs the session cookie; app refuses to start if empty | Secret Manager secret `s65da36e2-app-secret-1`, on the **service** only — **to be confirmed in the course portal** (not verified to exist; marked `UNVERIFIED` in `deploy/deploy.sh`) |
| `SEED_PASSWORD_MANAGER` | Seed script's manager account password | Secret Manager secret `s65da36e2-admin-password`, on the **job** only |
| `SEED_PASSWORD_PARTICIPANT_1` | Seed script's first participant account password | Secret Manager secret `s65da36e2-demo-password`, on the **job** only |
| `SEED_PASSWORD_PARTICIPANT_2` | Seed script's second participant account password | Same secret as `SEED_PASSWORD_PARTICIPANT_1` (`s65da36e2-demo-password`) — only one demo password is provisioned, so both participants get the same one |

## Local commands

The same build/test/migrate/seed commands this deployment relies on, run
locally (see `README.md` for full setup). Fake local values only — never a
real secret.

```bash
# Build (what the Dockerfile's two stages run)
cd backend && npm run build      # tsc -> backend/dist
cd frontend && npm run build     # tsc -b && vite build -> frontend/dist

# Test
cd backend && npm test           # Vitest + Supertest, needs DATABASE_URL_TEST
cd frontend && npm test          # Vitest + React Testing Library, no backend needed

# Run — either the dev servers (backend/package.json "dev", frontend "dev"),
# or the full built-image stack:
docker compose up --build        # db + app, http://localhost:3000

# Migrate (non-interactive, same command the Cloud Run job runs)
cd backend && npm run db:migrate:deploy

# Seed (needs SEED_PASSWORD_* — fake local values, e.g. via docker compose exec):
docker compose exec \
  -e SEED_PASSWORD_MANAGER=dev -e SEED_PASSWORD_PARTICIPANT_1=dev \
  -e SEED_PASSWORD_PARTICIPANT_2=dev app sh -c "npx prisma migrate deploy && npm run db:seed"
```

## The first manual deploy (`deploy/deploy.sh`)

Run once, from the repo root, after the course portal/TA has provisioned
everything in "Resource names" above. Preview first (this is also the
default if `DRY_RUN` is left unset — nothing is actually deployed):

```bash
DRY_RUN=1 bash deploy/deploy.sh
```

Only once that preview looks right, the **real** deploy — must be run from
the `main` branch, or the script's own guard refuses:

```bash
DRY_RUN=0 bash deploy/deploy.sh
```

What it does:

1. **Build & push the image** — builds the root `Dockerfile`, tags it with
   the current commit's full SHA, pushes it to Artifact Registry, then
   resolves that tag to its immutable `@sha256` digest (so later steps run
   exactly this image, not whatever `:latest` happens to point to then).
2. **Migrate + seed** — points the `s65da36e2-migrate` job at that image,
   updates its secrets/env vars (`--update-secrets`/`--update-env-vars`, see
   "Rules" below), then runs it and **waits** for it to finish. Inside the
   container, this runs `npx prisma migrate deploy && npm run db:seed` from
   `/app/backend` (the image's `WORKDIR`). If the job fails, the script
   stops here — the service is never touched, so a broken migration never
   reaches users.
3. **Deploy the service** — points `s65da36e2` at the same image, updates
   its secrets/env vars (including `FRONTEND_ORIGIN`, read from the
   service's own current URL), and sends it 100% of traffic.

## The automatic release flow

1. Open a GitHub Issue describing the change, label `lab5`.
2. Branch from `sprint-1-staging`.
3. Open a PR into `sprint-1-staging` ("Refs #&lt;issue&gt;"); a teammate
   reviews and approves. CI (`ci-docker.yml`, job `test-and-docker`) must be
   green.
4. Periodically, open a **release PR** from `sprint-1-staging` into `main`.
5. Merging that release PR pushes to `main`, which triggers
   `.github/workflows/deploy.yml`:
   - runs `ci-docker.yml` again,
   - builds and pushes the image tagged with the merge commit's full SHA,
   - runs `deploy/release.sh` (verify image digest → run the migration job
     → update the service, same order and the same fail-before-touching-the-service
     guarantee as the manual script),
   - smoke-tests the live URL (`deploy/smoke_test.py`),
   - writes a summary on the workflow run page.

**Smoke test (`deploy/smoke_test.py`).** Standard library only, called as
`python3 deploy/smoke_test.py "$SERVICE_URL"`. It checks, retrying while a
new revision starts up:

| Check | Request | Expected |
|---|---|---|
| health | `GET /health` | 200 `{"status":"ok"}` |
| readiness/DB | `GET /ready` | 200 `{"status":"ready"}` (503 means the database is unreachable) |
| HTML frontend | `GET /` | 200 `text/html` |
| JSON 404 | `GET /health/__smoke_404__` | 404 JSON, code `NOT_FOUND` (not `index.html`) |
| login (optional) | `POST /auth/login`, `GET /auth/me` with the session cookie, `POST /auth/logout` | 200, same email, logged out |

Our routes have no `/api` prefix, so the 404 check uses a sub-path of a known
route. Only failures that can clear up while a new revision starts
(connection errors, timeouts, HTTP 5xx such as `/ready` 503) are retried, for
at most `SMOKE_MAX_WAIT_SECONDS` (default 120 s) in total; a 4xx or a wrong
body fails at once. Exit code 0 = all passed, 1 = any check failed, 2 = bad
usage.

**Optional login check.** Runs only when both `SMOKE_EMAIL` (environment
variable) and `SMOKE_PASSWORD` (environment secret) are set in the `demo`
environment; with neither set it prints `SKIP`, with only one set it fails.
It logs in, calls `/auth/me`, then logs out. The password is never printed.

- Use a **PARTICIPANT** test account, never the manager:
  `SMOKE_EMAIL` = `participant2@example.com`, `SMOKE_PASSWORD` = the value of
  Secret Manager secret `s65da36e2-demo-password` (copy it in the GitHub
  `demo` environment's secrets UI; never paste it into Git, chat or a
  screenshot).
- The account is created by the seed (`backend/prisma/seed.ts`, upsert-only),
  which runs in the migration job `s65da36e2-migrate`. `deploy/deploy.sh`
  sets that job's command to `npx prisma migrate deploy && npm run db:seed`,
  and `deploy/release.sh` re-executes the same job, so the account exists in
  the demo database once the first `DRY_RUN=0 bash deploy/deploy.sh` has run.
- So set `SMOKE_EMAIL`/`SMOKE_PASSWORD` **only after** the first manual deploy
  succeeded and you can log in as that account in the browser. Set earlier,
  the login check fails after the service is already updated.

Run it by hand against any URL:

```bash
python3 deploy/smoke_test.py https://<service-url>
```

⚠️ A failed smoke test fails the workflow, but the service is already
serving the new release at that point; nothing is rolled back
automatically. Use the rollback below.

## How to see which commit is running

- The GitHub Actions run's summary (the "Record deployment" step in
  `deploy.yml`) prints the exact commit SHA that was deployed and the
  image's resolved digest.
- Directly from Cloud Run:
  ```bash
  gcloud run services describe s65da36e2 \
    --region asia-southeast1 --project cpe-se-course-2026 \
    --format='value(spec.template.spec.containers[0].image)'
  ```
  This returns the running image's immutable `@sha256` digest (the service
  is always updated by digest, not by a mutable tag). To map that digest
  back to a commit SHA outside of a given Actions run's summary, look up
  which tag Artifact Registry recorded for it — the image was originally
  pushed tagged with the commit's full SHA.

## Rollback

Run the `Deploy demo` workflow manually (`workflow_dispatch`) and enter
`image_tag` = the full 40-character commit SHA of an image that was already
successfully deployed before. This skips the test/build/migration steps
entirely (`ROLLBACK: true` in `release.sh`) and only re-points the service at
that existing image's digest, restoring 100% traffic to it. **No migration
or seed runs on rollback** — the database is left exactly as it is, which is
why a rollback can only go to an image whose migrations have already been
applied.

## Data-persistence test

Confirms sessions and data survive an instance being replaced (Cloud Run can
do this at any time — scale-to-zero, a new revision, etc.), not just a
feature working at all:

1. Log in as the seeded manager account.
2. Create a record (e.g. a template) using that session.
3. Force a new instance — trigger a new revision (even a no-op one, or just
   let the service scale to zero on `min-instances: 0` and cold-start again
   on the next request).
4. With the **same** session cookie, confirm the session is still
   authenticated (`GET /auth/me`) and the created record is still there.

Both surviving proves sessions live in Cloud SQL (not an instance's memory)
and that data is safely in Cloud SQL, independent of which container
instance happens to be serving a given request. This was verified locally
in `docs/labs/lab-05/evidence/16-docker-compose-e2e-verification.txt`
(container restart standing in for a replaced instance); the same steps
apply here against the real Cloud Run service.

## First deployment record (21 Nov 2026)

The first real deploy ran manually from `main` at commit
`5142906a97da4cc750b03f8b18baa8337019f7d2`, via `DRY_RUN=0 bash deploy/deploy.sh`.
Build, push, the migration job, and the service update all completed with no
errors.

- Service URL: `https://s65da36e2-4d7hbszvwq-as.a.run.app`
- `GET /health` → 200
- `GET /ready` → 200 (`{"status":"ready"}`)

[state before the Actions redeploy](evidence/28-before-redeploy.png)

### Login

Login page of the live service (URL visible in the address bar). The
logged-in state is shown in evidence/26.

[first deploy: login page](evidence/24-first-deploy-login-page.png)

### Persistence test

1. As that same logged-in manager session, created a template "Persistence
   test" (min 0, max 10).
2. Forced a new Cloud Run revision (`s65da36e2-00003-qwp`) with:
   ```bash
   gcloud run services update s65da36e2 --region asia-southeast1 \
     --update-env-vars PERSISTENCE_TEST=1
   ```
   — a no-op env var, purely to make Cloud Run create and switch traffic to
   a brand new container instance. `PERSISTENCE_TEST=1` was a temporary env
   var used only to force a new revision; it was removed afterwards.
   [new revision serving traffic](evidence/25-first-deploy-new-revision.png)
3. Once that new revision was serving 100% of traffic, the **same browser
   session** (no new login) was still authenticated, and the "Persistence
   test" template was still listed.
   [still logged in and template still listed after the revision swap](evidence/26-persistence-after-restart.png)

Confirms sessions and data live in Cloud SQL, not in any one instance's
memory: a brand new container instance (the new revision) still recognized
the session created by the previous instance, and could read the same row.

### Rule rejection

Creating a template with Min 10 and Max 5 (`minValue >= maxValue`) is
rejected with `"Invalid template fields."` (`backend/src/routes/templates.ts`).

[rule rejection](evidence/27-rule-rejection.png)

## Actions deploy record (21 Nov 2026)

- The release PR #56 (`sprint-1-staging` -> `main`) was reviewed and merged
  by the teammate. Merging into `main` triggered the "Deploy demo" workflow
  (`deploy.yml`), run #2:
  https://github.com/asamapornch/habit-activity-tracker/actions/runs/44886142902 .
  Commit `b63310c39c0d77bfa1842357fa025d19f1e8cf77`. Tests passed (169 + 38),
  the deploy job passed, and the smoke test passed (health, readiness/DB,
  HTML frontend, JSON 404 for an unknown API path). The service URL is
  https://s65da36e2-4d7hbszvwq-as.a.run.app .

- Rollback test: Deploy demo #4, started manually (`workflow_dispatch`) with
  `image_tag` = `5142906a97da4cc750b03f8b18baa8337019f7d2` (the previous
  release image):
  https://github.com/asamapornch/habit-activity-tracker/actions/runs/44886968327 .
  The summary shows "Rollback: true", the test job is skipped on purpose
  (nothing new to test), and the smoke test passed. After the rollback the
  service ran the older image (digest
  `sha256:ca72e17292e7bd2e37684a8f8a396393f397f5768fa827686034f54f6d76cc93`),
  the app still worked, and the login session and the "Persistence test"
  template were still there.

- Roll forward: Deploy demo #5, started manually from `main` with an empty
  `image_tag`:
  https://github.com/asamapornch/habit-activity-tracker/actions/runs/44887682225 .
  "Rollback: false", tag `b63310c...`, digest
  `sha256:b8b2dca9c29d452ce387f46afa52dc63e6023ee3ea89114b408010760dba0c5a` .

- Running revision check (C-06): `gcloud run services describe s65da36e2
  --region asia-southeast1 --project cpe-se-course-2026` shows
  `latestReadyRevisionName` `s65da36e2-00008-wwx` with image digest
  `sha256:b8b2dca9c29d452ce387f46afa52dc63e6023ee3ea89114b408010760dba0c5a` .
  This is the same digest as run #5, so the running revision matches the
  deployed commit `b63310c`. The revision list shows it was deployed by the
  deployer service account (`s65da36e2-deployer`), not by a person.

- Notes: Deploy demo #3 was an accidental duplicate run (same commit, empty
  `image_tag`, green). The image is rebuilt on every run, so the digest
  differs between runs of the same commit tag. The service was checked with
  `gcloud` because Console access to the shared course project is limited.

Evidence images for these runs are included in the PDF report.

## Rules

- **Never put a secret value in Git.** Only Secret Manager secret *names*
  belong in this repo (scripts, docs, commit messages, PR descriptions) —
  never a value. `deploy/deploy.sh`'s `run_cmd` helper also redacts
  `--password=...` in its own logged output as a second layer of defense.
- **Only touch `s65da36e2`-prefixed resources.** This is a shared course
  project with other teams' resources in it; never create, modify, or
  describe anything outside your own team's prefix, and never touch
  project-level IAM.
- **Use `--update-env-vars`/`--update-secrets`, not `--set-env-vars`/
  `--set-secrets`**, for any manual `gcloud run services update` or
  `gcloud run jobs update` command. "Set" replaces the *entire* env-var or
  secret set on the resource, silently wiping anything the portal
  configured that your command doesn't name; "update" only touches the keys
  you list.
