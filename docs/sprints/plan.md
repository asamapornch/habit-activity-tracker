# Sprint Plan — Habit & Activity Tracking

Three-sprint plan for the whole product (Part D). Feature IDs are from `docs/features.md`, requirement
IDs from `docs/srs.md` v1.1. Together the three sprints cover every FR, BR and NFR in the baseline
(see `docs/traceability.md`).

## 1. Overview

| Sprint | Goal | Features | Depends on | Completion outcome | Checkpoint |
| --- | --- | --- | --- | --- | --- |
| 1 | Small working domain slice with authentication, permissions and persistence | F-01, F-02, F-03, F-04, F-05 | Database schema, seed | A Manager defines templates; a Participant sets a goal, records daily values and sees history and progress through UI, API and database; every business rule and access rule is enforced on the server and tested; released on `main` as `v1.0-sprint1` | Deliverable 1, 8 Nov 2026 |
| 2 | Core expansion under engineering contracts | F-06, F-07, F-08 | Sprint 1 release (F-03, F-04); F-07 and F-08 need F-06's target-in-effect rule | A Participant revises a goal without changing past days, and sees streaks and weekly/monthly summaries; all new endpoints pass the F-05 access pattern | Deliverable 2, 29 Nov 2026 |
| 3 | Remaining features, integration and product hardening | F-09, F-10 | Sprint 2 release; Lab 5 (Docker, CI/CD, GCP) | Reminder schedules shown in the UI; the product runs in Docker on GCP with durable PostgreSQL, CI on every PR and the response-time target met; full regression suite green | Progress at 29 Nov; complete by 13 Dec 2026 |

## 2. Sprint 1 scope (8 Nov 2026)

**In scope:** login, logout and current user with two roles (F-01); templates created and updated by a
Manager and listed by everyone (F-02); goals from a template (F-03); one entry per day, history and
progress (F-04); API tests for 401/403/404 on every protected endpoint (F-05); screens for the whole
journey.

**Out of scope, planned later:** goal revision (Sprint 2), streaks (Sprint 2), summaries (Sprint 2),
reminders (Sprint 3), Docker, CI and GCP (Sprint 3 / Lab 5). Never in scope: self-registration,
password recovery, sharing history, medical advice (SRS §2.3).

**Why this slice:** it is the smallest journey that exercises authentication, both roles, ownership,
a state change (entries) and every Sprint 1 business rule, and Sprints 2 and 3 build on its goals and
entries without changing them.

| Feature | Owner | Reviewer | Order |
| --- | --- | --- | --- |
| F-01 Authentication and roles | Student 1 | Student 2 | 1 |
| F-02 Activity templates | Student 1 | Student 2 | 2 (needs F-01) |
| F-05 Access control, Stage A | Student 1 | Student 2 | 3 (red for F-03/F-04 endpoints) |
| F-03 Goals | Student 2 | Student 1 | 4 (needs F-02) |
| F-04 Entries, progress and history | Student 2 | Student 1 | 5 (needs F-03); F-05 Stage B turns green |
| Goal, entry and progress UI | Student 2 | Student 1 | 6 (needs F-03, F-04) |

## 3. Sprint 2 (29 Nov 2026)

| Feature | Requirements | Depends on | Done when |
| --- | --- | --- | --- |
| F-06 Goal revisions | FR-10, BR-10, BR-11 | F-03, F-04 | Revisions stored with an effective date; BR-10 rejections tested; progress uses the target in effect per day |
| F-07 Streaks | FR-11, BR-11, BR-12 | F-04, F-06 | Current and longest streak correct across gaps and revisions, tested at the API |
| F-08 Progress summaries | FR-12, BR-11 | F-04, F-06 | Weekly and monthly figures correct, tested at the API; shown in the goal screen |

Every new endpoint gets F-05-style tests (401, 403, another Participant's goal 404) in its own contract.

## 4. Sprint 3 (13 Dec 2026)

| Feature | Requirements | Depends on | Done when |
| --- | --- | --- | --- |
| F-09 Reminder schedules | FR-13, FR-14, BR-13 | F-03 | Schedules created, changed and removed; upcoming list correct for the next 7 days; BR-13 rejections tested |
| F-10 Deployment and hardening | NFR-06, NFR-07, NFR-08 | F-01 to F-09, Lab 5 | Docker images and GCP deployment with durable PostgreSQL; CI blocks failing PRs; timing test under 500 ms |

## 5. Product Definition of Done

A feature or release is done only when all of the following hold, each backed by evidence in the
repository, not by an AI agent's claim:

1. **Behaviour implemented:** every acceptance criterion in the feature's contract is met, through UI,
   API and database where the contract says so.
2. **Verification executed:** every planned test in the STS exists under its TEST ID and has been run;
   for rule work the failing (red) run before the code and the passing (green) run after are saved under
   `docs/sprints/sprint-<n>/evidence/`.
3. **Tests meaningful and passing:** `npm test` passes in `backend/` and `frontend/` from a clean
   checkout; no test is disabled, skipped or weakened to pass; access restrictions are tested against the
   API, not only the UI.
4. **Review and integration complete:** work is on a feature branch from sprint staging, linked to its
   Issue and contract, reviewed by the other student with a specific check recorded, merged into sprint
   staging, and released to `main` through a reviewed release PR with a tag.
5. **Setup and documents current:** README, `.env.example`, SRS, SDS, traceability and the contract
   (with its version history) match the released behaviour; no real secret is in Git.
6. **Incomplete work disclosed:** failed or skipped tests, known limitations and work moved to a later
   sprint are listed in the evidence report and the release notes.

Each feature contract also has its own Definition of Done (§6 of the contract) with feature-specific
items.
