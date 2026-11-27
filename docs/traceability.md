# Traceability Matrix — Habit & Activity Tracking

Requirement → feature or responsibility → sprint → verification. IDs are from `docs/srs.md` v1.3 and
`docs/features.md`. Each acceptance criterion AC-0X.n is verified by the test(s) with the same number,
TEST-0X.n (with letter variants such as TEST-04.6a to 04.6c), listed in the STS of its contract.

Test files: F-01 `backend/tests/auth.test.ts`, `frontend/src/App.test.tsx`; F-02
`backend/tests/templates.test.ts`, `frontend/src/Templates.test.tsx`; F-03 `backend/tests/goals.test.ts`,
`frontend/src/Goals.test.tsx`; F-04 `backend/tests/entries.test.ts`, `frontend/src/GoalDetail.test.tsx`;
F-05 `backend/tests/access.test.ts`; F-06 `backend/tests/goalRevisions.test.ts`, `backend/tests/effectiveOn.test.ts`
(unit, D-15), `frontend/src/GoalDetail.test.tsx`; F-07 `backend/tests/streaks.test.ts`,
`frontend/src/Streaks.test.tsx`; F-08 `backend/tests/goalSummaries.test.ts`, `frontend/src/GoalDetail.test.tsx`;
F-09 `backend/tests/reminders.test.ts`, `frontend/src/Reminders.test.tsx`.

## 1. Functional requirements

| Requirement | Feature | Sprint | Acceptance criteria / tests | Status |
| --- | --- | --- | --- | --- |
| FR-01 Login | F-01 | 1 | AC-01.1, 01.2, 01.12, 01.14 / TEST-01.1, 01.2, 01.12, 01.14 | Verified |
| FR-02 Logout, current user | F-01 | 1 | AC-01.3, 01.8, 01.14 to 01.16 / TEST-01.3, 01.8, 01.14 to 01.16 | Verified |
| FR-03 Create template | F-02 | 1 | AC-02.1, 02.15, 02.16 / TEST-02.1, 02.15, 02.16; Lab 7: AC-02.21, 02.26 / TEST-02.21a to 02.21c, 02.26a to 02.26c | Verified (Lab 7 part: PR #70) |
| FR-04 Update template | F-02 | 1 | AC-02.6, 02.15, 02.18 / TEST-02.6, 02.15, 02.18; Lab 7: AC-02.23, 02.26 / TEST-02.23a, 02.23b, 02.26a to 02.26c | Verified (Lab 7 part: PR #70) |
| FR-05 List templates | F-02 | 1 | AC-02.9, 02.13 / TEST-02.9, 02.13; Lab 7: AC-02.24, 02.27 / TEST-02.24, 02.27 | Verified (Lab 7 part: PR #70) |
| FR-06 Create and read goals | F-03 | 1 | AC-03.1, 03.11, 03.12, 03.15 to 03.17 / TEST-03.1, 03.11, 03.12, 03.15 to 03.17 | Verified |
| FR-07 Record an entry | F-04 | 1 | AC-04.1, 04.20 / TEST-04.1, 04.20a to 04.20c | Verified |
| FR-08 Progress | F-04 | 1 | AC-04.14, 04.18, 04.20 / TEST-04.14, 04.18, 04.20a | Verified |
| FR-09 Own history | F-04 | 1 | AC-04.13, 04.18, 04.19 / TEST-04.13, 04.18, 04.19 | Verified |
| FR-10 Goal revision | F-06 | 2 | AC-06.1 to AC-06.25 / TEST-06.1 to TEST-06.26, `docs/sprints/sprint-2/F-06-goal-revisions.md` v1.6 | Verified (PR #84) |
| FR-11 Streaks | F-07 | 2 | AC-07.1 to AC-07.17 / TEST-07.1a to TEST-07.17, `docs/sprints/sprint-2/F-07-streaks.md` v1.8 | Verified (PR #96) |
| FR-12 Summaries | F-08 | 2 | AC-08.1 to AC-08.16 / TEST-08.1a to TEST-08.16, `docs/sprints/sprint-2/F-08-progress-summaries.md` v1.7 | Verified (PR #85) |
| FR-13 Reminder schedule | F-09 | 3 | AC-09.1 to AC-09.9, AC-09.14 to AC-09.17, AC-09.19, AC-09.20 / TEST-09.1 to TEST-09.9, TEST-09.14a to TEST-09.17, TEST-09.19, TEST-09.20a (Slice 1 + UI), `docs/sprints/sprint-3/F-09-reminder-schedules.md` v1.5 | Verified (PR #86) |
| FR-14 Upcoming reminders | F-09 | 3 | AC-09.10 to AC-09.13, AC-09.18, AC-09.20 / TEST-09.10 to TEST-09.13b, TEST-09.18a/b, TEST-09.20b (Slice 2 + UI), `docs/sprints/sprint-3/F-09-reminder-schedules.md` v1.5 | Verified (PR #86) |

## 2. Business rules

| Requirement | Feature | Sprint | Acceptance criteria / tests | Status |
| --- | --- | --- | --- | --- |
| BR-01 One entry per day (409) | F-04 | 1 | AC-04.10, 04.11 (concurrent), 04.21 / TEST-04.10, 04.11, 04.21a | Verified |
| BR-02 Value within template range | F-04 | 1 | AC-04.9, 04.12, 04.21 / TEST-04.9, 04.12 | Verified |
| BR-03 No future date, within the template's back-dating limit (Lab 7), inside goal dates | F-04 | 1 | AC-04.6 to 04.8 (Asia/Bangkok today), 04.21 / TEST-04.6 to 04.8, 04.21b; Lab 7: AC-04.24 to 04.29 / TEST-04.24a to 04.24c, 04.25, 04.26, 04.27a to 04.27c, 04.28, 04.29 | Verified (Lab 7 part: PR #71) |
| BR-04 No overlapping goals per template (409) | F-03 | 1 | AC-03.8 to 03.10 (concurrent), 03.18 / TEST-03.8 to 03.10, 03.18a | Verified |
| BR-05 Target in range, end not before start | F-03 | 1 | AC-03.5, 03.7, 03.13, 03.18 / TEST-03.5, 03.7, 03.13, 03.18b | Verified |
| BR-06 Only a Manager writes templates (403) | F-02, F-05 | 1 | AC-02.2, 02.7, 02.10, 02.14, 05.2 / TEST-02.2, 02.7, 02.10, 02.14, 05.2; Lab 7: AC-02.25 / TEST-02.25a, 02.25b | Verified (Lab 7 part: PR #70) |
| BR-07 Template min < max | F-02 | 1 | AC-02.4 / TEST-02.4 | Verified |
| BR-08 Private goals and entries (404 / 403) | F-03, F-04, F-05 | 1 | AC-03.3, 03.11, 03.12, 04.3, 04.5, 04.13, 05.3 to 05.9 / same TEST IDs | Verified |
| BR-09 Progress calculation | F-04 | 1 | AC-04.14 to 04.16 / TEST-04.14a to 04.14e, 04.15, 04.16 | Verified |
| BR-10 Revision limits | F-06 | 2 | AC-06.7 to AC-06.9, AC-06.25 (D-24) / TEST-06.7 to TEST-06.9, TEST-06.25, TEST-06.26, `docs/sprints/sprint-2/F-06-goal-revisions.md` v1.6 | Verified (PR #84; D-24 settled on PR #76) |
| BR-11 Target in effect per day | F-06, F-07, F-08 | 2 | F-06 part: AC-06.5, AC-06.10 to AC-06.12, AC-06.20 to AC-06.24 / TEST-06.5, TEST-06.10 to TEST-06.14, TEST-06.21 to TEST-06.24, `docs/sprints/sprint-2/F-06-goal-revisions.md` v1.6 §2.5/§3.2/§3.4; F-07 part: AC-07.7, AC-07.8, AC-07.12 / TEST-07.7, TEST-07.8, TEST-07.12, `docs/sprints/sprint-2/F-07-streaks.md` v1.8; F-08 part: AC-08.6, AC-08.16 / TEST-08.6, TEST-08.16, `docs/sprints/sprint-2/F-08-progress-summaries.md` v1.7 | Verified (F-06 PR #84, F-07 PR #96, F-08 PR #85) |
| BR-12 Streak definition | F-07 | 2 | AC-07.1 to AC-07.6, AC-07.9 to AC-07.13 / TEST-07.1a to TEST-07.6, TEST-07.9a to TEST-07.13, `docs/sprints/sprint-2/F-07-streaks.md` v1.8 | Verified (PR #96) |
| BR-13 Reminder schedule limits | F-09 | 3 | AC-09.6, AC-09.11, AC-09.16 / TEST-09.6, TEST-09.11, TEST-09.11b, TEST-09.16, `docs/sprints/sprint-3/F-09-reminder-schedules.md` v1.5 | Verified (PR #86) |

## 3. Non-functional requirements

| Requirement | Feature or responsibility | Established / verified | Verification | Status |
| --- | --- | --- | --- | --- |
| NFR-01 Hashed passwords | F-01 | 1 / 1 | AC-01.6 / TEST-01.6 (stored hash differs from plaintext, bcrypt) | Verified |
| NFR-02 Server-side authorization | Authorization responsibility (F-01, F-05) | 1 / 1, extended each sprint | AC-01.4, 01.5, 01.9, 01.10, 02.3, 02.19, 03.2, 03.14, 03.19, 04.2, 04.17, 04.22, 05.1, 05.3 / same TEST IDs | Verified for Sprint 1 endpoints; extended to every Sprint 2/3 endpoint by the 401/403/404 tests of F-06 (TEST-06.4a, 06.4b, 06.6), F-07 (TEST-07.9a to 07.11), F-08 (TEST-08.7a to 08.9) and F-09 (TEST-09.3a, 09.3b, 09.5, 09.9, 09.13b) |
| NFR-03 No secrets in Git | Configuration responsibility | 1 / 1 | Manual: repository inspection; `.env` git-ignored, `.env.example` placeholders, seed reads passwords from env | Verified (manual) |
| NFR-04 One-command test suite | README | 1 / 1 | Manual: clean-checkout `npm test` in `backend/` and `frontend/` recorded in the evidence README | Verified (manual) |
| NFR-05 Clear 4xx errors, no crash | Error-handling responsibility | 1 / 1, extended each sprint | AC-01.2, 01.7, 01.11, 01.13, 01.17, 01.18, 02.5, 02.8, 02.11, 02.12, 02.17, 02.20, 03.4, 03.6, 03.14, 03.18, 03.20, 04.4, 04.17, 04.21, 04.23 / same TEST IDs; Lab 7: AC-02.22 / TEST-02.22a, 02.22b (added after release `b53e7bc` on 2026-11-26 23:25 +07: correction of an omission; the AC and tests existed and were implemented in PRs #69/#70) | Verified for Sprint 1 endpoints |
| NFR-06 Docker, durable DB, GCP | F-10 | 3 (Lab 5) | AC-10.1 to AC-10.3, `docs/sprints/sprint-3/F-10-deployment-hardening.md` v1.0 section 2.1, citing Lab 5 evidence already on main | Verified (Lab 5, already released) |
| NFR-07 Response time 500 ms | F-10 | 3 | AC-10.5 to AC-10.8 / TEST-10.1 to TEST-10.4, `docs/sprints/sprint-3/F-10-deployment-hardening.md` v1.0 section 2.2 | Contract written (planned); no timing test exists yet |
| NFR-08 CI on every PR | F-10 | 3 (Lab 5) | AC-10.4, `docs/sprints/sprint-3/F-10-deployment-hardening.md` v1.0 section 2.1, citing ci-docker.yml and Lab 5 Issue C-02 evidence already on main | Verified (Lab 5, already released) |

## 4. Coverage gaps

- No Sprint 1 requirement is without a feature and verification.
- FR-10 to FR-14 and BR-10 to BR-13 are verified on `sprint-1-staging` (F-06 to F-09, PRs #84, #96, #85,
  #86). Not yet verified: NFR-07 (F-10 timing test, contract v1.0 only, no test yet; D-22/D-23 still
  proposed). NFR-06 and NFR-08 are verified (Lab 5, released on `main`).
- NFR-03 and NFR-04 are verified by manual checks, not automated tests.
- One small unit-test layer since Sprint 2 (SRS D-15): `effectiveOn` (TEST-06.14). All other rule
  logic is verified through API tests against the real database, which also cover persistence and
  permissions.

## 5. Approved changes

| Change | Where | Approved in |
| --- | --- | --- |
| BR-04 overlap rule made explicit (inclusive dates, future goals) and NFR sprint column added | SRS | PR #7 |
| Participant PUT on a missing template id returns 403, not 404 (AC-02.10) | F-02 v1.1 | PR #11 review |
| Template id above the Postgres integer max returns 400 instead of 500 | F-02 v1.2 | PR #14 (Issue #13) |
| Check order: ownership (404) before goal-dependent validation | F-05 v1.1 | PR #16 review |
| `endDate` before `startDate` moved to BR-05 after the template 404; check order tested; D-09 | F-03 v1.1, SRS D-09 | PR #25 review |
| Clock set before login; progress as a percentage rounded to two decimals (D-10) | F-04 v1.1, SRS D-10 | PR #29 review |
| UI criteria for goals, entries and progress added | F-03 v1.2, F-04 v1.2 | PR #31 |
| History shows no UI-side "target met"; saved entry survives a failed progress refresh | F-04 v1.3 | PR #31 review |
| Per-template back-dating limit `backdateDays` (D-12): template field, migration, BR-03 check | SRS v1.2, F-02 v1.7, F-04 v1.5, system SDS v1.1 | Issue #65 (Lab 7), PR #69 review |
| Sprint 2 and 3 requirements added to the baseline; D-09 limited to goal creation | SRS v1.1, D-11 | PR #33 |
| Goal revisions take effect from today (D-13), later revision wins on the same day (D-14), one unit test for `effectiveOn` (D-15) | SRS v1.3, F-06 v1.5 | PR #76 review |
| Every reader of the goal's end date uses the end date in effect (entries range, BR-04 overlap, progress, F-07/F-08 `lastDay`, F-09 upcoming); revising an ended goal returns 409 (D-24) | F-06 v1.4/v1.5, F-07 v1.4, F-08 v1.5, F-09 v1.2, SRS D-24 | PR #76 review (warunwora), fixed in PR #84 |
| Streak anchor `lastDay` so an ended goal keeps its last run (D-16); own `GET /goals/:id/streaks` endpoint (D-17) | SRS v1.3, F-07 v1.5 | PR #77 approval |
| ISO week and calendar month clipped to the goal (D-18); average rounded half up (D-19) | SRS v1.3, F-08 v1.7 | PR #77 approval |
| One reminder schedule per goal, PUT replaces it (D-20); idempotent DELETE 204 (D-21) | SRS v1.3, F-09 v1.1.1 | PR #78 |
| Panel load errors on the goal and Goals screens stay inside the panel, no `role="alert"` (AC-09.20, AC-07.16) | F-09 v1.4, F-07 v1.5 | PR #86 review (asamapornch), PR #96 |

## 6. Known issues and remaining work (found on `sprint-1-staging` `d1eddad`, 2026-11-28)

None blocks the Deliverable 2 release. Each goes into the remaining-work plan to 13 December.

| # | Issue | Feature | Owner |
| --- | --- | --- | --- |
| K-1 | `backend/src/lib/staticFrontend.ts` `API_PATH_PREFIXES` does not list `/reminders`: an unknown path under `/reminders/` returns `index.html` instead of the API 404 (real routes work, they are mounted first) | F-09 | warunwora |
| K-2 | The Summary panel does not refetch after an entry is recorded (only after a revision, AC-08.15); it is correct after a reload | F-08 | asamapornch |
| K-3 | After a revision, the goal list shows the old target and end date until a reload (`Goals.tsx` loads the list once); `GET /goals` already returns the effective values | F-06 | asamapornch |
| K-4 | F-08 Summary load error uses `role="alert"`; F-07 and F-09 keep the error in the panel | F-08 | asamapornch |
| K-5 | NFR-07 (response time) not verified: F-10 timing test not written; D-22/D-23 still proposed | F-10 | to be assigned |
| K-6 | UAT X-03 (Issue #74): NUL character in a template name or login email may return 500; known limitation since `v1.1-lab7` | F-01, F-02 | asamapornch (triaged) |
