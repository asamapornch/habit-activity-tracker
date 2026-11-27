# F-10 — Deployment and Hardening (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-10 |
| Sprint | 3 (Docker/CI/GCP itself delivered in Lab 5) |
| Linked requirements | NFR-06, NFR-07, NFR-08 |
| Depends on | F-01 to F-09 (NFR-07's timing test needs a seeded goal with entries; the "full regression suite green" done-when condition needs every other feature's tests to exist), Lab 5 |
| Needed by | — |
| Owner | — (NFR-06/NFR-08 already delivered in Lab 5, see §2.1 — unattributed here; NFR-07 not yet assigned) |
| Reviewer | — (NFR-07 not yet assigned) |
| Status | **NFR-06 and NFR-08: already implemented and released (Lab 5, on `main` since `v1.1-lab7`). NFR-07: contract written (planned); no timing test exists yet.** |

## 1. Purpose

`docs/sprints/plan.md` §4 lists F-10's "done when" as: "Docker images and GCP deployment with
durable PostgreSQL; CI blocks failing PRs; timing test under 500 ms." The first two clauses
(NFR-06, NFR-08) are **already true today**, delivered by Lab 5 well before Sprint 3 formally
starts, and released on `main`. This contract exists to (a) record that evidence against F-10's own
AC/STS rather than leave it only in the Lab 5 docs, and (b) specify the one piece that is genuinely
not built yet: NFR-07's automated response-time test.

## 2. Behaviour

### 2.1 NFR-06 (Docker, durable PostgreSQL, GCP) and NFR-08 (CI on every PR) — already delivered

This section states what exists today, with pointers to where it was built and verified, **not** new
behaviour to implement:

- **Docker:** the root `Dockerfile` builds frontend and backend into one image (Lab 5,
  `docs/labs/lab-05/cloud-ready-contract.md` item 5, `docs/labs/lab-05/docker-ci.md`). Verified by
  `ci-docker.yml`'s "Build Docker image (no push)" step, which runs on every PR (see NFR-08 below)
  and is currently green on `main` (CI run `45812026155`, 2026-11-26).
- **Durable PostgreSQL:** Cloud SQL (managed Postgres), not the container's own disk
  (`docs/labs/lab-05/deployment.md` "Architecture"); sessions moved from in-memory to a Postgres-backed
  store for the same reason (`cloud-ready-contract.md` item 1), so a restart or a second instance
  never loses session or application data.
- **GCP deployment:** `.github/workflows/deploy.yml` deploys to Cloud Run on every push to `main`,
  with a separate migration job (`docs/labs/lab-05/deployment.md` "Architecture"); readiness is
  checked through `GET /ready` (`cloud-ready-contract.md` item 3), which actually queries the
  database, not just the process being up.
- **No secret baked into an image:** configuration is environment variables and GCP Secret Manager
  only (`docs/labs/lab-05/deployment.md` header: "No secret values appear anywhere in this document");
  `deploy.yml` authenticates to GCP with Workload Identity Federation, not a key file.
- **CI on every PR (NFR-08):** `.github/workflows/ci-docker.yml` runs on every PR into
  `sprint-1-staging` and `main`, and is required by branch protection
  (`docs/labs/lab-05/evidence/22-c02-pr42-merge-blocked.jpg`,
  `23-c02-pr42-test-and-docker-failed.jpg` — a deliberately failing check blocking a merge, Issue
  Lab 5 C-02). The latest run on `main` (`45812026155`) reports 15 backend test files / 194 tests
  passed and 4 frontend test files / 43 tests passed.

**No code, migration or test is added by this contract for NFR-06 or NFR-08** — they are already on
`main`. This section exists only so the traceability matrix can point at concrete evidence under
F-10's own AC/STS (§4, §5) instead of only at Lab 5's docs.

### 2.2 NFR-07 (response time) — planned, not yet built

1. **Timing test** (`backend/tests/performance.test.ts`, new file) seeds one goal with 366 daily
   entries (SRS NFR-07: "a goal with 366 entries") and asserts that `GET /goals/:id/progress`
   (F-04), and, once they exist, `GET /goals/:id/streaks` (F-07) and `GET /goals/:id/summary` (F-08),
   each respond within **500 ms** on the local stack (the same machine/CI runner the rest of the
   suite runs on — NFR-07 says "on the local stack," not production latency).
2. **Decision D-22 (proposed, needs review, this branch):** the test is written against whichever of
   F-04/F-07/F-08 are implemented at the time this contract's code is picked up; if F-07/F-08 are not
   yet merged, the test covers `GET /goals/:id/progress` alone and is extended (new test IDs, not a
   changed one) once they exist, rather than this contract blocking on both of them first. This
   keeps NFR-07 unblocked by Sprint 2's own dependency chain (F-06 → F-07/F-08).
3. The test measures wall-clock time around the HTTP call itself (Supertest's request, not a
   lower-level timer), so the number includes real middleware, database round trips and JSON
   serialization — the same path a real client experiences.
4. A failing timing test is informative, not necessarily a 500 ms **hard** gate in CI at first:
   **Decision D-23 (proposed, needs review, this branch):** the test is added as a normal `npm test`
   assertion (so it already blocks a merge like every other test, satisfying NFR-08's "cannot be
   merged while they fail"), but no separate CI step or threshold-tuning mechanism is added beyond
   that. If the reviewer wants a softer "warn, don't fail" mode (e.g. because CI runner performance
   varies more than a local machine's), that is a different decision this contract does not make on
   its own.

Other decisions:

- 366 entries (a full leap year) is the exact figure NFR-07 names; the seed in the test, not the
  product's seed script (`backend/prisma/seed.ts`, which seeds accounts only, unchanged by this
  contract), creates them directly through Prisma for test speed.
- Out of scope (this contract): load testing under concurrent users, performance of endpoints other
  than progress/streaks/summaries, any production APM or monitoring integration.

## 3. Interface specification

### 3.1 API

No new endpoint. NFR-07 is a non-functional constraint on existing (F-04) and planned (F-07, F-08)
read endpoints, not a new one.

### 3.2 Data

No schema change. The timing test's 366 entries are created and torn down by the test itself, inside
the existing test-database reset (system SDS §8), like every other backend test's fixtures.

**Layers that need no change, and why:** every route handler already in place (F-01 to F-09) — NFR-07
does not ask for any handler to be rewritten, only measured; if a handler turns out to be too slow,
that is a separate, later fix driven by this test's own red result, not something this contract
pre-emptively changes.

### 3.3 UI

None. NFR-07 has no UI-visible behaviour.

## 4. Acceptance criteria

**NFR-06 and NFR-08 (§2.1, already satisfied):**

| ID | Criterion | Requirement | Evidence |
| --- | --- | --- | --- |
| AC-10.1 | The root `Dockerfile` builds a single image containing both frontend and backend, built and verified on every PR. | NFR-06 | `ci-docker.yml` "Build Docker image" step, green on `main` |
| AC-10.2 | The deployed service uses a managed, durable PostgreSQL instance, not container-local storage; sessions survive an instance restart or routing to a different instance. | NFR-06 | `docs/labs/lab-05/deployment.md`, `cloud-ready-contract.md` item 1 |
| AC-10.3 | No real secret value appears in any committed file or built image; configuration comes from environment variables and GCP Secret Manager. | NFR-06 | `docs/labs/lab-05/deployment.md` header; repository inspection (manual, as for NFR-03) |
| AC-10.4 | Every pull request into `sprint-1-staging` or `main` runs the backend and frontend test suites, and a failing run blocks the merge (branch protection). | NFR-08 | `ci-docker.yml`; Lab 5 Issue C-02 evidence (`22`/`23-*.jpg`) |

**NFR-07 (§2.2, planned):**

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-10.5 | `GET /goals/:id/progress` for a goal with 366 entries responds within 500 ms on the local stack. | NFR-07 |
| AC-10.6 | Once F-07 exists, `GET /goals/:id/streaks` for the same goal responds within 500 ms. | NFR-07 |
| AC-10.7 | Once F-08 exists, `GET /goals/:id/summary` for the same goal responds within 500 ms. | NFR-07 |
| AC-10.8 | The timing test runs as part of `npm test` in `backend/` (not a separate command), so it is covered by NFR-08's "cannot be merged while they fail." | NFR-07, NFR-08 |

## 5. Software test specification (STS)

**NFR-06 and NFR-08:** no new test; existing evidence is cited in §4 and §2.1. The full backend/
frontend suite is the ongoing regression check (§5.3 pattern from F-06/F-07/F-08/F-09).

**NFR-07 — planned, not yet written as executable tests:**

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-10.1 | API/DB integration, timed | AC-10.5 | goal with 366 daily entries, `GET /goals/:id/progress` | responds within 500 ms |
| TEST-10.2 | API/DB integration, timed | AC-10.6 | same goal, `GET /goals/:id/streaks` (once F-07 exists; skipped with a clear reason until then, not silently passing) | responds within 500 ms |
| TEST-10.3 | API/DB integration, timed | AC-10.7 | same goal, `GET /goals/:id/summary` (once F-08 exists; same skip stance as TEST-10.2) | responds within 500 ms |
| TEST-10.4 | API/DB integration | AC-10.8 | `npm test` in `backend/` run from a clean checkout | includes TEST-10.1 to TEST-10.3 in the normal pass/fail result, no separate command |

### 5.2 Frontend tests — none; NFR-07/06/08 have no frontend-visible behaviour.

### 5.3 Regression — must stay unchanged

- All existing `TEST-01.*` to `TEST-09.*` must keep passing unmodified; this feature adds one new
  test file and no route or schema change.

## 6. Definition of done

- [x] NFR-06: Docker image, durable PostgreSQL, GCP deployment, no baked-in secret — already done,
      evidenced in §2.1/§4 (Lab 5, released on `main`).
- [x] NFR-08: CI on every PR, merge blocked on failure — already done, evidenced in §2.1/§4 (Lab 5,
      released on `main`).
- [ ] This contract's NFR-07 section is committed before the timing test code (this PR already
      satisfies "contract before code" for NFR-07; NFR-06/NFR-08 are retrospective documentation of
      already-shipped work, not subject to a red/green sequence here).
- [ ] TEST-10.1 is committed and fails first (red) because `performance.test.ts` does not exist yet,
      with the failing output saved under `docs/sprints/sprint-3/evidence/`.
- [ ] Implementation (if the 500 ms budget is not already met) or the test alone (if it is) makes
      TEST-10.1 pass (green), with the passing output saved.
- [ ] TEST-10.2 and TEST-10.3 are added once F-07 and F-08 exist, following the same red/green
      sequence, each in its own commit.
- [ ] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests (once
      F-07/F-08 exist; until then, TEST-10.2/10.3 are not yet present, not present-but-skipped).
- [ ] No existing test file is edited.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [ ] The two proposed decisions (D-22, D-23) are resolved by the reviewer before implementation
      starts.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Initial contract: NFR-06/NFR-08 documented against existing Lab 5 evidence; NFR-07 timing test specified as planned, not yet implemented | Sprint 3 planning (`docs/sprints/plan.md` §4) |
| 1.1 | 2026-11-27 | Decision IDs renumbered to avoid collision across PRs (D-13 → D-22, D-14 → D-23); no semantic change | Reviewer-facing cleanup before Deliverable 2 review |
