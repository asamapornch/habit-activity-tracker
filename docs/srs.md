# Software Requirements Specification — Habit & Activity Tracking

Course: CPE334 · Theme 8 (Habit and Activity Tracking) · Version 1.0 (Sprint 1 baseline)

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
- Goal revision (Sprint 2).

## 3. Functional requirements

| ID | Requirement | Feature | Sprint |
| --- | --- | --- | --- |
| FR-01 | A user can log in with email and password and receives an authenticated session. | F-01 | 1 |
| FR-02 | A logged-in user can log out; the session is no longer valid afterwards. The current user's identity and role can be retrieved while logged in. | F-01 | 1 |
| FR-03 | A Manager can create an activity template with name, unit, minimum value and maximum value. | F-02 | 1 |
| FR-04 | A Manager can update an existing template. | F-02 | 1 |
| FR-05 | Any logged-in user can list templates. | F-02 | 1 |
| FR-06 | A Participant can create a goal from a template with a daily target, a start date and an end date. | F-03 | 1 |
| FR-07 | A Participant can record a value for a date on one of their own goals. | F-04 | 1 |
| FR-08 | A Participant can view computed progress for one of their own goals. | F-04 | 1 |
| FR-09 | A Participant can view the list of their own entries for a goal. | F-04 | 1 |

## 4. Business rules

| ID | Rule | Rejection | Feature |
| --- | --- | --- | --- |
| BR-01 | A goal accepts at most one entry per calendar date. | 409 | F-04 |
| BR-02 | An entry value must lie within the template's minimum and maximum (inclusive). | 400 | F-04 |
| BR-03 | An entry date must not be in the future, before the goal start date, or after the goal end date. | 400 | F-04 |
| BR-04 | A Participant cannot have two goals for the same template whose date ranges overlap (start and end dates inclusive). | 409 | F-03 |
| BR-05 | A goal's daily target must lie within the template range, and its end date must not be before its start date. | 400 | F-03 |
| BR-06 | Only a Manager can create or update templates. | 403 | F-02 |
| BR-07 | A template's minimum must be strictly less than its maximum. | 400 | F-02 |
| BR-08 | A Participant's goals and entries are private. Another Participant gets 404; a Manager gets 403 (role gate). | 404 / 403 | F-05 |
| BR-09 | Progress = (number of days with a recorded value at or above the daily target) ÷ (number of days elapsed from goal start to today, capped at goal end date, counting both ends). | — | F-04 |

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
| D-02 | Back-dating allowed within the goal period; future dates rejected (BR-03). | Participants may forget to record; future entries are meaningless. |
| D-03 | Goal changes are deferred to Sprint 2. | The brief lists goal revisions as a later sprint item. |
| D-04 | Participant history is private with no sharing in Sprint 1 (BR-08). | The brief says Managers do not automatically gain access to private records. |
| D-05 | Another Participant's record returns 404; a wrong role (including a Manager reading participant data) returns 403; no session returns 401. | Avoid leaking existence; keep codes consistent with the role gate. |
| D-06 | Changing a template's range applies only to new input. Existing goals and entries are not revalidated; progress uses each goal's stored daily target. | Keeps history stable and avoids retroactive invalidation. |
| D-07 | Numeric values are stored as floats limited to two decimal places and compared after rounding to two decimals. | Avoids floating-point surprises in the target comparison (BR-09). |
| D-08 | Goals for the same template may not overlap in date range, including future goals (BR-04). | A check on "active today" would let two future goals become active together later. |
