# Software Requirements Specification — Habit & Activity Tracking

Course: CPE334 · Theme 8 (Habit and Activity Tracking) · Version 1.3 (proposed) (whole-product baseline; Lab 7 change, Issue #65; v1.3 proposes D-13 to D-15 for the Sprint 2 F-06 contract, not yet reviewed)

## 1. Purpose and context

This system lets a program manager define trackable activities (for example "Running, km, 0–50")
and lets participants set personal goals on those activities, record one value per day, and see
computed progress and their own history. It is a recording system only.

### 1.1 Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Program Manager | Defines which activities can be tracked and the valid value range for each. |
| Participant | Sets goals, records daily progress, sees progress and own history; expects privacy. |
| Course staff (TAs) | Verify requirements, tests and evidence. |
| Development pair | Builds and maintains the system across three sprints. |

### 1.2 Actors

- **Manager** — authenticated user with role `MANAGER`.
- **Participant** — authenticated user with role `PARTICIPANT`.
- **Anonymous visitor** — unauthenticated; can only reach the login endpoint.

## 2. Scope

### 2.1 In scope (whole product)

Authentication and roles, activity templates, goals, daily entries, progress calculation, history,
goal revisions, streak/history logic, reminder/schedule representation, progress summaries.

### 2.2 In scope for Sprint 1

Login/logout and current user; templates (create, update, list); goal creation; daily entry with
validation; progress and own history; access-control tests.

### 2.3 Out of scope

- Medical diagnosis or treatment advice.
- Real notification delivery (reminders are representation only, Sprint 3).
- Sharing a participant's history with anyone else (no consent-based sharing).
- Self-registration, password recovery, advanced account administration. Test accounts are seeded.
- Goal revision in Sprint 1 (planned for Sprint 2, FR-10).

## 3. Functional requirements

| ID | Requirement | Feature | Sprint |
| --- | --- | --- | --- |
| FR-01 | A user can log in with email and password and receives an authenticated session. | F-01 | 1 |
| FR-02 | A logged-in user can log out; the session is no longer valid afterwards. The current user's identity and role can be retrieved while logged in. | F-01 | 1 |
| FR-03 | A Manager can create an activity template with name, unit, minimum value, maximum value and an optional back-dating limit in days. | F-02 | 1 (back-dating limit: Lab 7) |
| FR-04 | A Manager can update an existing template, including its back-dating limit. | F-02 | 1 (back-dating limit: Lab 7) |
| FR-05 | Any logged-in user can list templates. | F-02 | 1 |
| FR-06 | A Participant can create a goal from a template with a daily target, a start date and an end date. | F-03 | 1 |
| FR-07 | A Participant can record a value for a date on one of their own goals. | F-04 | 1 |
| FR-08 | A Participant can view computed progress for one of their own goals. | F-04 | 1 |
| FR-09 | A Participant can view the list of their own entries for a goal. | F-04 | 1 |
| FR-10 | A Participant can revise one of their own goals (daily target and/or end date); each revision is kept with the date it takes effect. | F-06 | 2 |
| FR-11 | A Participant can see the current streak and the longest streak of days that met the target for one of their own goals. | F-07 | 2 |
| FR-12 | A Participant can see a weekly and a monthly summary of one of their own goals (days recorded, days met, total and average value). | F-08 | 2 |
| FR-13 | A Participant can set, change and remove a reminder schedule (days of the week and a time) for one of their own goals; the schedule is shown, not delivered. | F-09 | 3 |
| FR-14 | A Participant can see their upcoming reminders for the next 7 days across their active goals. | F-09 | 3 |

## 4. Business rules

| ID | Rule | Rejection | Feature |
| --- | --- | --- | --- |
| BR-01 | A goal accepts at most one entry per calendar date. | 409 | F-04 |
| BR-02 | An entry value must lie within the template's minimum and maximum (inclusive). | 400 | F-04 |
| BR-03 | An entry date must not be in the future, earlier than today minus the template's back-dating limit (when the template has one, D-12), before the goal start date, or after the goal end date. | 400 | F-04 |
| BR-04 | A Participant cannot have two goals for the same template whose date ranges overlap (start and end dates inclusive). | 409 | F-03 |
| BR-05 | A goal's daily target must lie within the template range, and its end date must not be before its start date. | 400 | F-03 |
| BR-06 | Only a Manager can create or update templates. | 403 | F-02 |
| BR-07 | A template's minimum must be strictly less than its maximum. | 400 | F-02 |
| BR-08 | A Participant's goals and entries are private. Another Participant gets 404; a Manager gets 403 (role gate). | 404 / 403 | F-05 |
| BR-09 | Progress = (number of days with a recorded value at or above the daily target) ÷ (number of days elapsed from goal start to today, capped at goal end date, counting both ends). | — | F-04 |
| BR-10 | A goal revision cannot change the template or the start date; the new daily target must lie within the template's current range; the new end date must not be before today, the start date, or the goal's latest entry date; the new end date must not create an overlap under BR-04. | 400 / 409 | F-06 |
| BR-11 | A revision applies from its effective date; progress, streaks and summaries for earlier days use the daily target that was in effect on each day. | — | F-06, F-07, F-08 |
| BR-12 | A streak counts consecutive calendar days with an entry at or above the target in effect; a day without an entry ends it. The current streak ends today, or yesterday if today has no entry yet. | — | F-07 |
| BR-13 | A reminder schedule needs at least one weekday and a time `HH:MM` (Asia/Bangkok), may exist only for the Participant's own goal, and produces no reminders outside the goal's dates. | 400 / 404 | F-09 |

BR-01 to BR-09 are Sprint 1; BR-10 to BR-13 are allocated to the sprint of their feature.

Note on BR-08: a Manager is stopped at the role gate (403) because these endpoints are Participant-only.
Another Participant's record returns 404 (not 403) so the response does not reveal whether it exists.

## 5. Non-functional requirements

| ID | Requirement | How it is measured | Sprint |
| --- | --- | --- | --- |
| NFR-01 | Passwords are stored only as salted hashes. | Inspection of the stored value; test asserts it differs from the plaintext. | 1 |
| NFR-02 | Authorization is enforced on the server for every protected endpoint. | Direct API calls with a wrong role or no session are rejected (401/403/404) in automated tests, independent of the UI. | 1 |
| NFR-03 | No real secrets are committed. Configuration is read from environment variables; `.env.example` has placeholders only. | Repository inspection. | 1 |
| NFR-04 | The full automated test suite runs with one documented command. | README command succeeds on a clean checkout. | 1 |
| NFR-05 | Invalid input returns a clear error message and an appropriate 4xx status; the server does not crash. | Negative-case tests for each endpoint. | 1 (extended in 2 and 3 as endpoints are added) |
| NFR-06 | The application runs as Docker containers with PostgreSQL on durable storage and is deployed to GCP; no secret is baked into an image. | Container build and start from a clean checkout; deployed health check returns 200; image inspection. | 3 (Lab 5) |
| NFR-07 | Progress, streak and summary requests for a goal with 366 entries respond within 500 ms on the local stack. | Automated timing test against a seeded goal. | 3 |
| NFR-08 | Every pull request runs the backend and frontend test suites in CI and cannot be merged while they fail. | CI run attached to each PR. | 3 (Lab 5) |

## 6. Assumptions

- A-01: One daily value per goal per date is sufficient (accumulation across several entries is not needed).
- A-02: Dates are calendar dates; time of day is not recorded. "Today" is always the current date in the Asia/Bangkok time zone, computed by the server.
- A-03: Accounts are seeded: one Manager and two Participants.
- A-04: A template's range applies to the daily value; the unit is a free-text label.
- A-05: Values and daily targets have at most two decimal places; more decimals are rejected with 400.

## 7. Decisions

| ID | Decision | Reason |
| --- | --- | --- |
| D-01 | Duplicate-entry behaviour: one entry per day per goal, duplicates rejected (BR-01). | The brief requires a specified one-entry-per-day or accumulation rule; one-per-day is simpler to verify. |
| D-02 | Back-dating allowed within the goal period, limited by the template's back-dating limit when it has one (D-12); future dates rejected (BR-03). | Participants may forget to record; future entries are meaningless. |
| D-03 | Goal changes are deferred to Sprint 2. | The brief lists goal revisions as a later sprint item. |
| D-04 | Participant history is private with no sharing in Sprint 1 (BR-08). | The brief says Managers do not automatically gain access to private records. |
| D-05 | Another Participant's record returns 404; a wrong role (including a Manager reading participant data) returns 403; no session returns 401. | Avoid leaking existence; keep codes consistent with the role gate. |
| D-06 | Changing a template's range applies only to new input. Existing goals and entries are not revalidated; progress uses each goal's stored daily target. | Keeps history stable and avoids retroactive invalidation. |
| D-07 | Numeric values are stored as floats limited to two decimal places and compared after rounding to two decimals. | Avoids floating-point surprises in the target comparison (BR-09). |
| D-08 | Goals for the same template may not overlap in date range, including future goals (BR-04). | A check on "active today" would let two future goals become active together later. |
| D-09 | A goal's start date may be in the past (a goal may be created after it started); no goal-creation rule depends on "today" (a later revision rule, BR-10, does). | Matches back-dating for entries (D-02); a Participant may set up a goal a few days late. |
| D-10 | Progress (BR-09) is returned as a percentage, `daysMet ÷ daysElapsed × 100`, rounded half up to two decimals (e.g. 2 of 3 days = 66.67); it is 0 when no day has elapsed. | Easier to read than a ratio in the UI and in the evidence; two decimals match the precision of values (A-05). |
| D-11 | Requirements for Sprints 2 and 3 (FR-10 to FR-14, BR-10 to BR-13, NFR-06 to NFR-08) are added to the baseline now, with feature and sprint allocation, from the whole-product scope in §2.1; their detailed AC and tests are written in each sprint's contracts. | The brief requires every baseline requirement to have a feature and sprint now (Part B). |
| D-12 | A template has an optional back-dating limit `backdateDays`, an integer from 0 to 30 set only by a Manager (BR-06); `null` (or the key left out) means no limit, the Sprint 1 behaviour, and every template that existed before the change has `null`. With a limit N, an entry dated before today − N (Asia/Bangkok, A-02) is rejected (BR-03); 0 allows today only. The template's current limit is used, like the range (D-06): changing it never changes or removes existing entries, and progress (BR-09) still counts them. | Old values recorded weeks later are less reliable and can raise progress in bulk; different activities need different windows, so the limit belongs to the template (Lab 7 change request, Issue #65). |
| D-13 (proposed, needs review) | A goal revision (F-06) always takes effect from today (Asia/Bangkok) at the moment it is created; a caller cannot set a past or future `effectiveFrom`. | Simplest reading consistent with BR-10's "new end date must not be before today," which only makes sense for an immediate revision; neither the SRS nor `docs/sprints/plan.md` §3 asks for a scheduled or back-dated revision. |
| D-14 (proposed, needs review) | When two revisions of the same goal (F-06) share the same `effectiveFrom` date, the one with the higher `id` (created later) is the one in effect for that day and afterward, until superseded. | FR-10/BR-11 require "the target in effect per day" to be well defined even if a Participant revises a goal twice in one day; ordering by `id` is the simplest tie-break available without adding a second timestamp column. |
| D-15 (proposed, needs review) | F-06 adds one unit-level test (TEST-06.14) for the pure "value in effect on day D" resolution function, in addition to the API/DB integration tests. | System SDS §9 states Sprint 1 has "no separate unit-test layer" because rule logic is otherwise simple enough to verify through API tests alone; the revision-resolution lookup (latest-`effectiveFrom`-then-highest-`id`) is reusable by F-07 and F-08 and benefits from being checked in isolation from the database. This does not replace any required BR-10/BR-11 API-level test. |

## 8. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Initial SRS: Sprint 1 FR-01 to FR-09, BR-01 to BR-09, NFR-01 to NFR-05 | Sprint 1 baseline |
| 1.0 (+D-09, D-10) | 2026-11-07 | Decisions D-09 and D-10 added with the F-03 and F-04 contracts | PR #25, PR #29 review |
| 1.1 | 2026-11-07 | FR-10 to FR-14, BR-10 to BR-13, NFR-06 to NFR-08 and D-11 added for Sprints 2 and 3; D-09 narrowed to goal creation | Whole-product traceability (Part B); PR #33 review |
| 1.2 | 2026-11-26 | Per-template back-dating limit: FR-03, FR-04, BR-03 and D-02 changed, D-12 added | Lab 7 change request, Issue #65 |
| 1.3 (proposed) | 2026-11-27 | D-13, D-14, D-15 added, all marked "(proposed, needs review)" | Sprint 2 F-06 contract (`docs/sprints/sprint-2/F-06-goal-revisions.md`), written before any F-06 implementation |
