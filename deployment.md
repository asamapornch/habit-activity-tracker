# Deployment

How this app runs in the cloud, in plain English. No secret values appear
anywhere in this document — only resource names and Secret Manager secret
*names*.

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

## The first manual deploy (`deploy/deploy.sh`)

Run once, from the repo root, after the course portal/TA has provisioned
everything in "Resource names" above. Preview first:

```bash
DRY_RUN=1 bash deploy/deploy.sh
```

What it does, once `DRY_RUN` is unset (or `0`):

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
   - smoke-tests the live URL (`deploy/smoke_test.py` — added in a separate
     PR; not yet in this repo),
   - writes a summary on the workflow run page.

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
