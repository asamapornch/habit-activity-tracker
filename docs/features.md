# Features — Habit & Activity Tracking

Feature inventory for the whole product (Part B). Requirement IDs are from `docs/srs.md` v1.2.
Sprint 1 features have an engineering contract under `docs/sprints/sprint-1/`; Sprint 2 and 3 features
get their contracts at the start of their sprint.

| ID | Feature | Description | Requirements | Depends on | Sprint | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Authentication and roles | Email and password login with a server session (8 h), logout, current user (`/auth/me`), roles `MANAGER` and `PARTICIPANT`, `requireAuth` / `requireRole` middleware, login screen | FR-01, FR-02, NFR-01, NFR-02, NFR-03, NFR-05 | Database schema (`User`), seed | 1 | Done (PR #9, #19) |
| F-02 | Activity templates | Manager creates and updates templates (name, unit, min, max, optional back-dating limit from Lab 7); every signed-in user lists them; template screens | FR-03, FR-04, FR-05, BR-06, BR-07, NFR-05, D-12 | F-01 | 1 | Done (PR #12, #14, #21); Lab 7 change (Issue #65) done in PR #70 |
| F-03 | Goals | Participant creates a goal from a template (daily target, start and end date) and lists and reads own goals; goal screens | FR-06, BR-04, BR-05, BR-08, NFR-02, NFR-05 | F-01, F-02 | 1 | Done (PR #27, #31) |
| F-04 | Entries, progress and history | Participant records one value per day on an own goal, within the template's back-dating limit (Lab 7), sees history in date order and computed progress; goal screen | FR-07, FR-08, FR-09, BR-01, BR-02, BR-03, BR-08, BR-09, NFR-02, NFR-05, D-12 | F-01, F-02, F-03 | 1 | Done (PR #30, #31); Lab 7 change (Issue #65) done in PR #71 |
| F-05 | Access control (cross-cutting) | API tests that every protected endpoint rejects no session (401), wrong role (403) and another Participant's records (404), independent of the UI | NFR-02, BR-06, BR-08 | F-01 to F-04 | 1 | Done (PR #17, Stage B with #30) |
| F-06 | Goal revisions | Participant revises the daily target and/or end date of an own goal; revisions kept with an effective date; past days keep their old target | FR-10, BR-10, BR-11, BR-04, BR-08 | F-03, F-04 | 2 | Planned |
| F-07 | Streaks | Current and longest streak per goal from entries and the target in effect on each day | FR-11, BR-11, BR-12, BR-08 | F-04, F-06 | 2 | Planned |
| F-08 | Progress summaries | Weekly and monthly summary per goal: days recorded, days met, total and average value | FR-12, BR-11, BR-08 | F-04, F-06 | 2 | Planned |
| F-09 | Reminder schedules | Participant sets weekdays and a time per goal; upcoming reminders for the next 7 days are listed; nothing is delivered | FR-13, FR-14, BR-13, BR-08 | F-03 | 3 | Contract written (planned) — `docs/sprints/sprint-3/F-09-reminder-schedules.md` v1.0; no code yet; Slice 1 (one goal's own schedule) is the smallest implementable workflow |
| F-10 | Deployment and hardening | Docker images, PostgreSQL on durable storage, GCP deployment, CI on every PR, performance check | NFR-06, NFR-07, NFR-08 | F-01 to F-09 | 3 (Lab 5 for Docker/CI/GCP) | NFR-06/NFR-08 done (Lab 5, already on main); NFR-07 contract written (planned) — `docs/sprints/sprint-3/F-10-deployment-hardening.md` v1.0; no timing test yet |

## System responsibilities (cross-cutting)

| Responsibility | Requirements | Established | Verified |
| --- | --- | --- | --- |
| Server-side authorization on every endpoint | NFR-02, BR-08 | Sprint 1 (F-01 middleware, F-05) | Sprint 1 by F-05 and each feature's 401/403 tests; extended to every new endpoint in Sprints 2 and 3 |
| Standard error body and 4xx for invalid input | NFR-05 | Sprint 1 (F-01 error handler) | Every feature's negative tests, each sprint |
| Secrets only in environment variables | NFR-03 | Sprint 1 (`.env.example`, seed from env) | Repository inspection each release; image inspection in Sprint 3 (NFR-06) |
| One-command test suite | NFR-04 | Sprint 1 (README) | Clean-checkout run recorded in each release's evidence |
