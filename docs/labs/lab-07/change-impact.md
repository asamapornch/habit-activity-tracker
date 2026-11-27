# Lab 7 – Change impact: per-template back-dating limit

Change request: Issue #65. Written before any test or code change (contract PR).

## 1. Change

| | Sprint 1 (accepted) | After the change |
| --- | --- | --- |
| Rule | BR-03: an entry date must not be in the future, before the goal start, or after the goal end. Any past date inside the goal is allowed (D-02). | BR-03 also rejects a date before today − N when the goal's template has a back-dating limit N (D-12). `null` = no limit, the Sprint 1 rule. |
| Template | `name`, `unit`, `minValue`, `maxValue` | plus optional `backdateDays`: integer 0 to 30 or `null`, set only by a Manager |
| New error | none | 400 `VALIDATION_ERROR` `Entry date must not be earlier than <today − N>.` |
| Order inside BR-03 | future → outside the goal | future → too old → outside the goal |

## 2. Versions

| Item | Version |
| --- | --- |
| Accepted Sprint 1 baseline (old behaviour) | tag `v1.0-sprint1` = `444dd05` (PR #34 merge, 2026-11-07) |
| Build used for Lab 6 UAT | `main` at `0619c07` (2026-11-21) — a different, later commit, not the tag itself. 71 files changed since `444dd05` (Lab 5 cloud-readiness/deploy infrastructure: trust proxy, `/ready`, static frontend serving, a Postgres session store via `connect-pg-simple`, config, db pool, an `@@ignore`'d `Session` model), none touching `backend/src/routes/{auth,templates,goals,entries}.ts` or any service file; verified by `git diff --stat 444dd05 0619c07` |
| Pre-change implementation | `main` at `5d0e4ba` (release PR #67, Lab 6), deployed 2026-11-26 |
| Intervening development since the baseline | Lab 5 cloud-readiness and deploy files; Lab 6 fixes PR #63 (B2-01, `errorHandler.ts`) and PR #64 (#60, `Templates.tsx` wheel blur). None changes BR-03. No Sprint 2 code is on `main`. |
| Contract (this document, SRS v1.2, F-02 v1.7, F-04 v1.5, system SDS v1.1) | PR #69, merged before any test or code |
| Tests and code | PR #70 F-02 field (red `7d9888a` → code `3d3d538`), PR #71 F-04 rule (red `1343c13` → code `71032a8`) |

## 3. Impact

| Requirement | Feature | SRS / Feature SDS / System SDS | Acceptance criteria | STS tests | Code modules |
| --- | --- | --- | --- | --- | --- |
| FR-03, FR-04, FR-05, D-12 | F-02 | SRS §3, §7 D-12; F-02 §2, §3.1 to §3.3; system SDS §3 data model | AC-02.21 to AC-02.24, AC-02.26, AC-02.27 (new) | TEST-02.21a to TEST-02.24, TEST-02.26a to TEST-02.27 (new) | `backend/prisma/schema.prisma` + new migration, `backend/src/routes/templates.ts`, `frontend/src/api.ts`, `frontend/src/Templates.tsx` |
| BR-06 | F-02, F-05 | F-02 §2 | AC-02.25 (new); AC-02.2, 02.7, 02.10, 05.2 (unchanged) | TEST-02.25a/b (new); TEST-02.2, 02.7, 02.8c, 05.2* (unchanged) | `requireRole` (unchanged) |
| BR-03, D-02, D-12, A-02 | F-04 | SRS §4 BR-03, §7 D-02/D-12; F-04 §2 step 5, other decisions, §3.1 error table; system SDS §3, §4 check order | AC-04.24 to AC-04.29 (new); AC-04.6 to 04.8 (unchanged) | TEST-04.24a to TEST-04.29 (new); TEST-04.6a to 04.8b (unchanged) | `backend/src/routes/entries.ts` (BR-03 block) |
| BR-08, NFR-02 | F-04, F-05 | F-04 §2 step 4 (unchanged) | AC-04.27 (new check-order case); AC-04.3, 04.5, 05.* (unchanged) | TEST-04.27c (new); TEST-04.3, 04.5, 05.* (unchanged) | `findOwnGoal`, `requireRole` (unchanged) |
| BR-09, D-06 | F-04 | F-04 §2 Behaviour 9 (unchanged) | AC-04.28 (new); AC-04.14 to 04.16 (unchanged) | TEST-04.28 (new); TEST-04.14a to 04.16 (unchanged) | progress route (unchanged) |

| Area | Applies? | Reason |
| --- | --- | --- |
| Callers and dependencies | Yes | `POST /goals/:id/entries` reads the goal's template, which it already loads for BR-02; no other caller reads `backdateDays`. Sprint 2 features (F-06 to F-08) are not on `main` and do not record entries. |
| UI / API validation | Yes | API validates `backdateDays` and enforces the date limit. The template form gets one field; the entry form shows the server message verbatim (AC-04.21) and gets no rule of its own, so `GoalDetail.tsx` does not change. |
| Roles and ownership | Yes, unchanged rules | Only a Manager writes templates (BR-06, AC-02.25). Entry ownership (404) and the Manager role gate (403) still answer before any date check (AC-04.27). |
| Persistence and migration | Yes | One migration adds a nullable integer column to `templates`; no default, no backfill. |
| Historical data | Yes | Existing templates become `null` (no limit), so they behave exactly as in Sprint 1. Existing entries are never revalidated or removed, even when a Manager adds or lowers a limit; progress keeps counting them (AC-04.28). |
| Seed data | No | `backend/prisma/seed.ts` creates users only, no templates. |
| Goals (F-03, BR-04, BR-05) | No | Goal creation does not depend on the entry date limit. |
| Sessions, auth (F-01) | No | Not touched. |

## 4. Behaviour that must stay unchanged, and the tests that protect it

| Unchanged behaviour | Protecting tests (run in full in each PR) |
| --- | --- |
| Templates without a limit behave as in Sprint 1 (create, update, list, validation, 403/404 rules) | TEST-02.1a to TEST-02.20 (backend and frontend), TEST-04.26 |
| Future date rejected; goal start/end limits; Asia/Bangkok today; check order | TEST-04.6a to TEST-04.8b, TEST-04.17a to TEST-04.17e, TEST-04.24c |
| BR-01 one entry per day, BR-02 value range | TEST-04.9a to TEST-04.12 |
| BR-08 privacy: other Participant 404, Manager 403, anonymous 401 | TEST-04.2 to TEST-04.5b, all 23 TEST-05.* |
| BR-09 progress | TEST-04.14a to TEST-04.16 |
| Goals (BR-04, BR-05) and auth | TEST-03.*, TEST-01.* |

No existing expected result changes: existing tests create templates without `backdateDays`, which
stores `null` (no limit). If any existing test fails after a change, the change is wrong, not the
test.

## 6. Addendum (added after release, 2026-11-26 23:25 +07): change size

Files touched by PRs #69 to #72, from `gh pr diff --name-only` on each PR. PR #72 is the release
merge of #69, #70 and #71 into `main`; its file list is the union of theirs, with no files beyond
that union.

| File | PR(s) |
| --- | --- |
| `docs/features.md` | #69, #71 |
| `docs/srs.md` | #69 |
| `docs/system-sds.md` | #69 |
| `docs/sprints/sprint-1/F-02-templates.md` | #69, #70 |
| `docs/sprints/sprint-1/F-04-entries.md` | #69, #71 |
| `docs/traceability.md` | #69, #70, #71 |
| `docs/labs/lab-07/change-impact.md` | #69, #71 |
| `backend/prisma/schema.prisma` | #70 |
| `backend/prisma/migrations/20261126110641_add_template_backdate_days/migration.sql` | #70 |
| `backend/src/routes/templates.ts` | #70 |
| `backend/src/routes/entries.ts` | #71 |
| `backend/tests/templates.test.ts` | #70 |
| `backend/tests/entries.test.ts` | #71 |
| `frontend/src/Templates.tsx` | #70 |
| `frontend/src/api.ts` | #70 |
| `frontend/src/Templates.test.tsx` | #70 |
| `docs/labs/lab-07/evidence/F-02-backdate-red-backend.txt` | #70 |
| `docs/labs/lab-07/evidence/F-02-backdate-red-frontend.txt` | #70 |
| `docs/labs/lab-07/evidence/F-02-backdate-green-backend.txt` | #70 |
| `docs/labs/lab-07/evidence/F-02-backdate-green-frontend.txt` | #70 |
| `docs/labs/lab-07/evidence/F-04-backdate-red-backend.txt` | #71 |
| `docs/labs/lab-07/evidence/F-04-backdate-green-backend.txt` | #71 |
| `docs/labs/lab-07/evidence/F-04-backdate-green-frontend.txt` | #71 |

Totals: 22 files. 1 migration file plus 1 schema file. 2 backend route files. 2 backend test files.
3 frontend files. 7 evidence files. 7 contract/doc files.
