# F-04 — Entries, Progress and History (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-04 |
| Sprint | 1 |
| Linked requirements | FR-07, FR-08, FR-09, BR-01, BR-02, BR-03, BR-08, BR-09, NFR-02, NFR-05 |
| Depends on | F-01 (`requireAuth`, `requireRole`), F-02 (templates), F-03 (goals, `CONFLICT`, shared validation), database schema (`Entry`) |
| Needed by | F-05 (Stage B), release |
| Owner | Student 2 |
| Reviewer | Student 1 |
| Status | Implemented and merged into `sprint-1-staging` (PR #29, #30, #31) |

## 1. Purpose

Let a Participant record one value per day on one of their own goals, see the list of their own
entries for that goal (history), and see the progress computed from those entries. This completes
the Sprint 1 journey: template → goal → daily entry → progress.

## 2. Behaviour

1. **Record** (`POST /goals/:id/entries`, Participant, goal owner) validates the body and stores one
   entry for the given date.
2. **History** (`GET /goals/:id/entries`, Participant, goal owner) returns that goal's entries.
3. **Progress** (`GET /goals/:id/progress`, Participant, goal owner) returns the BR-09 calculation.
4. Checks run in this order on every endpoint (system SDS §4, F-05 §2.5), and the first failing step
   answers:
   1. no session: **401**;
   2. wrong role (a Manager): **403**, before the body or id is looked at;
   3. body shape and id format only: **400** `Invalid entry fields.` / `Invalid goal id.`
      (missing, unknown or wrongly typed fields, malformed date, too many decimals, malformed id);
   4. goal existence and ownership: **404** `Goal not found.` — the same response for a goal that
      does not exist and a goal of another Participant (BR-08), identical to F-03;
   5. BR-03, entry date, checked against "today" and the goal's dates: a date after today
      (**400** `Entry date must not be in the future.`), otherwise a date before the goal's start or
      after its end (**400** `Entry date must be within the goal's start and end dates.`);
   6. BR-02, value outside the template's current range: **400**
      `Value must be within the template range.`;
   7. BR-01, the goal already has an entry on that date: **409** `CONFLICT`.
   A non-owner therefore always receives 404 and learns nothing about the goal's dates, template
   range or entries (F-05 AC-05.9).
5. **"Today"** is the current calendar date in the **Asia/Bangkok** time zone, computed by the server
   (SRS A-02, system SDS §3). A date equal to today is allowed. The server's own time zone setting
   (`TZ`) does not matter. Inside BR-03 the future check comes first: a date that is both after today
   and after the goal's end returns `Entry date must not be in the future.`
6. **BR-01** is checked in the API first and backed by the database unique constraint on
   (`goalId`, `date`). If two requests race past the API check, the constraint violation is turned
   into the same 409 response, never a 500.
7. **BR-02** uses the template's **current** range (SRS D-06): after a Manager changes the range, a
   new entry is validated against the new range; existing entries are not revalidated or changed.
   Values are compared after rounding to two decimals (SRS D-07).
8. **History** returns only the requested goal's entries, ordered by `date` ascending.
9. **BR-09 progress**, for a goal with start `S`, end `E` and stored `dailyTarget`:
   - `lastDay` = the earlier of today and `E`;
   - `daysElapsed` = the number of calendar days from `S` to `lastDay`, counting both ends; `0` when
     today is before `S`;
   - `daysMet` = the number of the goal's entries dated from `S` to `lastDay` whose value, rounded to
     two decimals, is **at or above** the goal's `dailyTarget` rounded to two decimals;
   - `progress` = `daysMet ÷ daysElapsed × 100`, rounded half up to two decimals (a percentage,
     SRS D-10); `0` when `daysElapsed` is `0`.
   Days with no entry count as not met. The goal's stored `dailyTarget` is used even if the template
   range has changed since (SRS D-06). Example: target 5 km, 1–30 November, today 5 November,
   entries 5, 3, 6 on 1–3 November and 5 on 5 November: `daysMet` 3, `daysElapsed` 5, `progress` 60.

Field rules (request body of `POST /goals/:id/entries`), checked in step 3 unless stated:

- The body must be a JSON object (not an array or `null`) with exactly the keys `date` and `value`.
  Missing or unknown keys return 400.
- `date`: a string in exactly `YYYY-MM-DD` form that is a real calendar date (same rule as F-03).
- `value`: a finite JSON number with at most two decimal places (SRS A-05); a numeric string is
  rejected. `0.07` and `1.15` are accepted.
- BR-03 and BR-02 are checked in steps 5 and 6, after the goal is found.

Other decisions:

- An entry cannot be changed or deleted in Sprint 1 (not in the SRS); a mistaken entry stays. BR-01
  makes a second entry for the same date a 409, not an update.
- Back-dating within the goal period is allowed (SRS D-02).
- `value` has no rule beyond the template range; 0 and negative values are accepted when inside it.
- Dates are returned as `YYYY-MM-DD` strings; `value`, `daysElapsed`, `daysMet` and `progress` as
  JSON numbers.

Out of scope (Sprint 1): editing or deleting entries, accumulating several values per day (SRS A-01),
streaks (Sprint 2/3), reminders (Sprint 3), Manager views of entries.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /goals/:id/entries` | Participant (owner) | `{ date, value }` | `201 { id, goalId, date, value }` | `400`, `401`, `403`, `404`, `409` |
| `GET /goals/:id/entries` | Participant (owner) | none | `200 [ { id, goalId, date, value } ]` ordered by `date` | `400`, `401`, `403`, `404` |
| `GET /goals/:id/progress` | Participant (owner) | none | `200 { goalId, today, daysElapsed, daysMet, progress }` | `400`, `401`, `403`, `404` |

`today` in the progress response is the server's Asia/Bangkok date (`YYYY-MM-DD`), so a reader can
check the calculation.

Error body: `{ "error": { "code", "message" } }`.

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid entry fields.` | body shape (step 3) |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (step 3, same as F-03) |
| 400 | `VALIDATION_ERROR` | `Entry date must not be in the future.` | BR-03, date after today (step 5) |
| 400 | `VALIDATION_ERROR` | `Entry date must be within the goal's start and end dates.` | BR-03, outside the goal (step 5) |
| 400 | `VALIDATION_ERROR` | `Value must be within the template range.` | BR-02 (step 6) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01) | Manager |
| 404 | `NOT_FOUND` | `Goal not found.` (same as F-03) | goal does not exist or belongs to another Participant |
| 409 | `CONFLICT` | `An entry already exists for this date.` | BR-01 (API check or unique constraint) |

`CONFLICT` was added to `ErrorCode` in F-03; F-04 reuses it as the code for the BR-01 409, asserted by
TEST-04.10a and TEST-04.11. Existing test files, including `backend/tests/access.test.ts` (owned by
Student 1), are not changed.

### 3.2 Data

Table `Entry`: `id`, `goalId` (foreign key to `Goal`), `date` (calendar date), `value` (float, two
decimals), with the unique constraint on (`goalId`, `date`), as in the system SDS. No schema change
is needed. Progress is computed on each request; nothing extra is stored.

### 3.3 UI

Added in v1.2 (Issue #26). Opening a goal from the F-03 goal list shows a goal screen with: a
**progress** panel (`daysMet of daysElapsed days met` and `progress` as a percentage, from
`GET /goals/:id/progress`), a **record entry** form (date input prefilled with the progress `today`,
value with step 0.01), and the **history** table of the goal's entries in date order (from
`GET /goals/:id/entries`, date and value only: whether a day met the target is BR-09 and is shown
only through the server's progress). A **Back to goals** control returns to the list. Server messages are shown as
returned; a `401` returns to the login screen. The UI never decides a rule itself: the server checks
BR-01, BR-02 and BR-03.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-04.1 | The goal's owner recording a valid entry receives 201 with the stored entry (`id`, `goalId`, `date`, `value`); the entry is stored. | FR-07 |
| AC-04.2 | Anonymous requests to all three endpoints receive 401. | NFR-02 |
| AC-04.3 | A Manager calling any of the three endpoints receives 403, including for an existing goal, and no entry is stored. | BR-08, NFR-02 |
| AC-04.4 | A body that is not an object, missing or unknown fields, a wrongly typed value (including a numeric string), more than two decimals, or a malformed or impossible date return 400 `Invalid entry fields.` and nothing is stored; a malformed goal id returns 400 `Invalid goal id.`; two-decimal values such as 0.07 and 1.15 are accepted. | NFR-05, SRS A-05 |
| AC-04.5 | A goal that does not exist and another Participant's goal return the same 404 on all three endpoints, and no entry is stored. | BR-08 |
| AC-04.6 | An entry dated after today (Asia/Bangkok) returns 400 `Entry date must not be in the future.` and nothing is stored, including a date that is also after the goal's end (the future check comes first); an entry dated today is accepted. | BR-03 |
| AC-04.7 | An entry dated before the goal's start or after its end returns 400 `Entry date must be within the goal's start and end dates.` and nothing is stored; entries on the start and end dates are accepted. | BR-03 |
| AC-04.8 | "Today" follows Asia/Bangkok, not UTC and not the server's `TZ`: at 00:30 on 8 November in Bangkok (17:30 UTC on 7 November) an entry for 8 November is accepted, and at 23:59 on 7 November in Bangkok an entry for 8 November is rejected as future, with the process running in a time zone other than Bangkok. | BR-03, SRS A-02 |
| AC-04.9 | A value below the template minimum or above the template maximum returns 400 `Value must be within the template range.` and nothing is stored; values equal to the minimum and the maximum are accepted. | BR-02 |
| AC-04.10 | A second entry on a date that already has an entry for the goal returns 409 `CONFLICT` `An entry already exists for this date.` and the first entry is unchanged; the same date on a different goal is accepted. | BR-01 |
| AC-04.11 | Concurrent entries for the same goal and date result in exactly one 201, the rest 409 `CONFLICT`, and one stored entry (no 500). | BR-01 |
| AC-04.12 | After a Manager changes a template's range, existing entries are unchanged, and a new entry is validated against the new range. | SRS D-06 |
| AC-04.13 | `GET /goals/:id/entries` returns 200 with exactly that goal's entries, ordered by date, and an empty list when there are none. | FR-09, BR-08 |
| AC-04.14 | `GET /goals/:id/progress` returns `daysElapsed`, `daysMet` and `progress` as defined in Behaviour 9, including the 3-of-5 = 60 example, rounding to two decimals (down for 1 of 3 = 33.33, up for 2 of 3 = 66.67), a value exactly equal to the target counting as met, and `today` in Asia/Bangkok. | FR-08, BR-09, SRS D-10 |
| AC-04.15 | Progress before the goal starts is `daysElapsed` 0, `daysMet` 0, `progress` 0; after the goal ends, `daysElapsed` stops at the end date. | BR-09 |
| AC-04.16 | Progress uses the goal's stored `dailyTarget`, even after the template's range has changed. | BR-09, SRS D-06 |
| AC-04.17 | The check order of Behaviour 4 holds when a request has several faults: 401 before 400, 403 before 400, 404 before BR-03/BR-02/BR-01, BR-03 before BR-02, and BR-02 before BR-01. | NFR-02, NFR-05, BR-08 |
| AC-04.18 | Opening a goal shows its history in date order and its progress (`daysMet`, `daysElapsed`, `progress` %); a loading message is shown while they are fetched, and an error message if a request fails. | FR-08, FR-09 |
| AC-04.19 | A goal with no entries shows an empty-history message and 0 % progress. | FR-09 |
| AC-04.20 | Recording an entry sends `POST /goals/:id/entries` with `date` as `YYYY-MM-DD` (prefilled with the progress `today`) and `value` as a JSON number; the entry appears in the history in date order and the progress shown is refreshed from the server; if only the refresh fails, the entry is still shown as saved. | FR-07, FR-08 |
| AC-04.21 | A 400 or 409 from `POST /goals/:id/entries` is shown with the server's message verbatim, and the form keeps what was typed. | BR-01, BR-02, BR-03, NFR-05 |
| AC-04.22 | A `401` from any entry or progress request returns the user to the login screen. | NFR-02 |
| AC-04.23 | The record button is disabled while the request is in flight. | NFR-05 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/entries.test.ts`. Each test creates
its own Manager `M` and two Participants `P1`, `P2` in `beforeEach` (bcrypt-hashed) and logs in
through the real `POST /auth/login`, keeping each cookie. Templates, goals and existing entries are
inserted directly through Prisma. The shared setup resets the test database before every test.

**Clock.** Tests fix the clock with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime`
(only `Date` is faked, so timers used by Supertest, Express and Prisma keep running), and restore it
in `afterEach`. Unless a test says otherwise, now is **2026-11-05T05:00:00Z** (12:00 on 5 November in
Bangkok), so today is `2026-11-05`.

**Clock before login.** A session lasts 8 hours (`SESSION_LIFETIME_MS`, system SDS §5) and its expiry
is computed from `Date` at login. Each test therefore sets its clock **first** and logs in **after**:
`beforeEach` creates the users and fixtures but does not log in; each test calls `setNow(...)` (default
2026-11-05T05:00:00Z) and then `loginAll()`, which logs in `M`, `P1` and `P2` through the real
`POST /auth/login`. A test that needs a different time (TEST-04.7b/c, 04.8a/b, 04.14b to 04.16) sets that
time before `loginAll()` and does not move the clock afterwards.

**Server time zone.** TEST-04.8a, 04.8b and 04.14d set `process.env.TZ = "America/Los_Angeles"` before
the request and restore the previous value in `afterEach`. At 17:30 UTC on 7 November the local date
there is still 7 November while Bangkok is on 8 November, so an implementation that uses local time
(or UTC) instead of Asia/Bangkok fails these tests on any machine.

**Fixtures.** Template `T` is `{ "Running", "km", 0, 50 }`. Goal `G1` is owned by `P1` on `T` with
`dailyTarget` 5, `2026-11-01`..`2026-11-30`. Goal `G2` is owned by `P2` on `T` with the same dates.
The valid body `B` is `{ date: "2026-11-03", value: 5 }`; each test changes only the fields it names.

Every rejection test asserts status, `error.code` and the exact `error.message` from §3.1, and that the
entry table is unchanged ("nothing stored"). Messages used below:
`AUTH` = `Authentication required.`, `ROLE` = `You do not have permission to perform this action.`,
`FIELDS` = `Invalid entry fields.`, `ID` = `Invalid goal id.`, `GOAL404` = `Goal not found.`,
`FUTURE` = `Entry date must not be in the future.`, `OUTSIDE` = `Entry date must be within the goal's start and end dates.`,
`RANGE` = `Value must be within the template range.`, `DUP` = `An entry already exists for this date.`

Tests marked **control** first send the request with only one fault and assert the real response, so a
404 from a missing route cannot make them pass.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-04.1a | AC-04.1 | `P1` `POST /goals/:G1/entries` with `B` | 201; body `{ id, goalId: G1, date: "2026-11-03", value: 5 }`; one entry stored |
| TEST-04.1b | AC-04.1, AC-04.4 | `P1` posts values 0.07, 1.15 and 2.5 on 1, 2 and 4 November | 201 for each with the same `value` returned |
| TEST-04.2 | AC-04.2 | no cookie: `POST /goals/:G1/entries` with `B`, `GET /goals/:G1/entries`, `GET /goals/:G1/progress` | 401 `UNAUTHENTICATED` `AUTH` for each; nothing stored |
| TEST-04.3a | AC-04.3 | `M` `POST /goals/:G1/entries` with `B` | 403 `FORBIDDEN` `ROLE`; nothing stored |
| TEST-04.3b | AC-04.3 | `M` `GET /goals/:G1/entries` and `GET /goals/:G1/progress` | 403 `FORBIDDEN` `ROLE` for each |
| TEST-04.4a | AC-04.4 | `P1` posts `{}` | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-04.4b | AC-04.4 | `P1` posts `B` plus `"note": "x"` | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-04.4c | AC-04.4 | `P1` posts `value` `"5"` (string) | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-04.4d | AC-04.4 | `P1` posts `value` 5.123 | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-04.4e | AC-04.4 | `P1` posts `date` `"03/11/2026"`, `"2026-11-03T00:00:00Z"` and `"2026-02-30"` | 400 `VALIDATION_ERROR` `FIELDS` for each; nothing stored |
| TEST-04.4f | AC-04.4 | `P1` posts body `[]`, then `null` (sent as JSON) | 400 `VALIDATION_ERROR` `FIELDS` for each; nothing stored |
| TEST-04.4g | AC-04.4 | `P1` `POST`, `GET entries` and `GET progress` on goal ids `abc`, `0` and `99999999999` | 400 `VALIDATION_ERROR` `ID` for each; nothing stored |
| TEST-04.5a | AC-04.5 | **control** `P1` posts `B` to `G1` (201); then `P2` posts `B` with date `2026-11-04` to `G1` and to goal 99999 | `P2` gets 404 `NOT_FOUND` `GOAL404` for both, identical; only `P1`'s entry stored |
| TEST-04.5b | AC-04.5 | **control** `P1` `GET /goals/:G1/entries` and `/progress` (200); then `P2` the same on `G1` and on goal 99999 | `P2` gets 404 `NOT_FOUND` `GOAL404` for all four, identical |
| TEST-04.6a | AC-04.6 | `P1` posts `date` `2026-11-06` (tomorrow) | 400 `VALIDATION_ERROR` `FUTURE`; nothing stored |
| TEST-04.6b | AC-04.6 | `P1` posts `date` `2026-11-05` (today) | 201 |
| TEST-04.6c | AC-04.6, AC-04.17 | today 2026-11-05; `P1` posts `date` `2026-12-01` to `G1` (after today **and** after the goal's end) | 400 `VALIDATION_ERROR` `FUTURE` (not `OUTSIDE`); nothing stored |
| TEST-04.7a | AC-04.7 | `P1` posts `date` `2026-10-31` (day before start) | 400 `VALIDATION_ERROR` `OUTSIDE`; nothing stored |
| TEST-04.7b | AC-04.7 | now 2026-12-10T05:00:00Z; `P1` posts `date` `2026-12-01` (after the end, not future) | 400 `VALIDATION_ERROR` `OUTSIDE`; nothing stored |
| TEST-04.7c | AC-04.7 | now 2026-12-10T05:00:00Z; `P1` posts `date` `2026-11-01` (start) and `2026-11-30` (end) | 201 for each |
| TEST-04.8a | AC-04.8 | `TZ` `America/Los_Angeles`; now 2026-11-07T17:30:00Z (00:30 on 8 Nov in Bangkok); `P1` posts `date` `2026-11-08` | 201 |
| TEST-04.8b | AC-04.8 | `TZ` `America/Los_Angeles`; now 2026-11-07T16:59:00Z (23:59 on 7 Nov in Bangkok); `P1` posts `date` `2026-11-08` | 400 `VALIDATION_ERROR` `FUTURE`; nothing stored |
| TEST-04.9a | AC-04.9 | `P1` posts `value` 51 | 400 `VALIDATION_ERROR` `RANGE`; nothing stored |
| TEST-04.9b | AC-04.9 | `P1` posts `value` -0.01 | 400 `VALIDATION_ERROR` `RANGE`; nothing stored |
| TEST-04.9c | AC-04.9 | `P1` posts `value` 0 on 1 Nov and 50 on 2 Nov | 201 for each |
| TEST-04.10a | AC-04.10 | `G1` has an entry `2026-11-03` value 5; `P1` posts `{ date: "2026-11-03", value: 7 }` | 409 `CONFLICT` `DUP`; still one entry, value 5 |
| TEST-04.10b | AC-04.10 | `P1` also owns `G3` on another template `T2` (`{ "Reading", "minutes", 0, 300 }`) with the same dates; `G1` has an entry on `2026-11-03`; `P1` posts `B` to `G3` | 201 |
| TEST-04.11 | AC-04.11 | `P1` sends five `POST /goals/:G1/entries` with `B` at the same time (`Promise.all`) | exactly one 201 and four 409 `CONFLICT` `DUP` (no 500); one entry stored |
| TEST-04.12 | AC-04.12 | `G1` has an entry `2026-11-01` value 40; `M` `PUT /templates/:T` to range 0–20; `P1` `GET /goals/:G1/entries`; `P1` posts `{ date: "2026-11-02", value: 30 }` | existing entry still value 40; new entry 400 `VALIDATION_ERROR` `RANGE`, nothing new stored |
| TEST-04.13a | AC-04.13 | `G1` has entries on 3, 1 and 2 November (inserted in that order); `G2` has one entry; `P1` `GET /goals/:G1/entries` | 200; exactly `G1`'s three entries ordered 1, 2, 3 November with `id`, `goalId`, `date`, `value` |
| TEST-04.13b | AC-04.13 | `P1` `GET /goals/:G1/entries` with no entries | 200 `[]` |
| TEST-04.14a | AC-04.14 | today 2026-11-05; `G1` entries 1 Nov 5, 2 Nov 3, 3 Nov 6, 5 Nov 5 | 200 `{ goalId: G1, today: "2026-11-05", daysElapsed: 5, daysMet: 3, progress: 60 }` |
| TEST-04.14b | AC-04.14 | today 2026-11-03; `G1` entry 1 Nov value 5 only | `daysElapsed` 3, `daysMet` 1, `progress` 33.33 |
| TEST-04.14c | AC-04.14 | goal `G4` of `P1` on `T2` with `dailyTarget` 1.15, 1–30 Nov; today 2026-11-02; entries 1 Nov 1.15, 2 Nov 1.14 | `daysMet` 1 (equal counts as met), `daysElapsed` 2, `progress` 50 |
| TEST-04.14d | AC-04.14 | `TZ` `America/Los_Angeles`; now 2026-11-07T17:30:00Z (8 Nov in Bangkok); `G1` with no entries | `today` `"2026-11-08"`, `daysElapsed` 8, `daysMet` 0, `progress` 0 |
| TEST-04.14e | AC-04.14 | today 2026-11-03; `G1` entries 1 Nov 5 and 2 Nov 6 | `daysElapsed` 3, `daysMet` 2, `progress` 66.67 (rounded up) |
| TEST-04.15a | AC-04.15 | today 2026-10-20 (before `G1` starts) | `daysElapsed` 0, `daysMet` 0, `progress` 0 |
| TEST-04.15b | AC-04.15 | goal `G5` of `P1` on `T2`, 1–10 Nov, target 5; entries 1 Nov 5 and 10 Nov 5; now 2026-11-20T05:00:00Z | `daysElapsed` 10, `daysMet` 2, `progress` 20 |
| TEST-04.16 | AC-04.16 | `G1` (target 5) has entry 1 Nov value 5; today 2026-11-01; `M` `PUT /templates/:T` to range 10–50; `P1` `GET /goals/:G1/progress` | `daysMet` 1, `daysElapsed` 1, `progress` 100 (stored target 5 used) |
| TEST-04.17a | AC-04.17 | no cookie: `POST /goals/:G1/entries` with `{}` | 401 `UNAUTHENTICATED` `AUTH` (not 400) |
| TEST-04.17b | AC-04.17 | `M` `POST /goals/:G1/entries` with `{}`; `M` `GET /goals/abc/entries` | 403 `FORBIDDEN` `ROLE` for each (not 400) |
| TEST-04.17c | AC-04.17 | **control** `P1` posts a future date to `G1` (400 `FUTURE`); then `P1` posts the same body to goal 99999 | 404 `NOT_FOUND` `GOAL404` (not 400); nothing stored |
| TEST-04.17d | AC-04.17 | **control** `P1` posts `{ date: "2026-11-03", value: 999 }` to `G1` (400 `RANGE`); then `P1` posts `{ date: "2026-10-31", value: 999 }` to `G1` | 400 `VALIDATION_ERROR` `OUTSIDE` (BR-03 before BR-02); nothing stored |
| TEST-04.17e | AC-04.17 | `G1` has an entry on `2026-11-03`; **control** `P1` posts `B` (409 `DUP`); then `P1` posts `{ date: "2026-11-03", value: 999 }` | 400 `VALIDATION_ERROR` `RANGE` (BR-02 before BR-01); still one entry |

### 5.2 Frontend tests

Component tests (Vitest + React Testing Library) in `frontend/src/GoalDetail.test.tsx`, with `fetch`
mocked per test. Goal `G1` on template `T` Running (km, 0–50), target 5, 2026-11-01..2026-11-30;
progress `today` is `2026-11-05`.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-04.18a | AC-04.18 | entries `[{2026-11-01, 5}, {2026-11-03, 6}]` (server order); progress `{ daysElapsed: 5, daysMet: 2, progress: 40 }` | history rows in order `2026-11-01`, `2026-11-03` with values and unit; progress shows `2 of 5 days met` and `40%`; the history has only Date and Value columns (no UI-side target check) |
| TEST-04.18b | AC-04.18 | (a) both requests left pending; (b) `GET /goals/:id/entries` rejected | (a) a loading message first; (b) an error message (`role="alert"`), not an endless loading state |
| TEST-04.19 | AC-04.19 | entries `[]`, progress `{ daysElapsed: 5, daysMet: 0, progress: 0 }` | an empty-history message (`No entries yet.`) and `0%` |
| TEST-04.20a | AC-04.20 | entries `[{2026-11-01, 5}]`, progress `{ 5, 1, 20 }`; user changes the date to `2026-11-03`, types value `7.25`, submits; POST returns 201; the next progress call returns `{ 5, 2, 40 }` | the date input was prefilled with `2026-11-05`; POST called with `{ date: "2026-11-03", value: 7.25 }` (number); history shows `2026-11-01` then `2026-11-03`; progress updates to `40%` from the second progress call |
| TEST-04.20b | AC-04.20 | **Open** on a goal in the F-03 goal list, then **Back to goals** | the goal screen for that goal is shown (its progress panel and history); back returns to the goal list |
| TEST-04.20c | AC-04.20 | POST returns 201; the progress refresh after it is rejected | the entry appears in the history; the form shows no error and is not kept for a retry; a separate message `Entry saved, but progress could not be refreshed.` is shown |
| TEST-04.21a | AC-04.21 | POST mocked to 409 `An entry already exists for this date.` | that exact message is shown; date and value still hold what was typed; history unchanged |
| TEST-04.21b | AC-04.21 | POST mocked to 400 `Entry date must not be in the future.` | that exact message is shown; the form keeps its values |
| TEST-04.22 | AC-04.22 | `App` as a Participant, Open a goal; `GET /goals/:id/progress` mocked to 401 | the login form is shown |
| TEST-04.23 | AC-04.23 | POST left pending | the record button is disabled until the request resolves |

### 5.3 Existing tests and expected F-05 state

- No existing test file is changed. `CONFLICT` for BR-01 is asserted by TEST-04.10a and TEST-04.11.
- AC-04.17 "404 before BR-02 and BR-01" is covered by F-05: TEST-05.9b (value out of range on another
  Participant's goal → 404) and TEST-05.9c (duplicate date on another Participant's goal → 404). The F-04
  tests cover 404 before BR-03 (TEST-04.17c) and the order inside the data checks (TEST-04.6c, 04.17d, 04.17e).
- With this feature the remaining 12 F-05 tests turn green (TEST-05.1d, 05.3d, 05.3e, 05.4b, 05.4c,
  05.5, 05.7b, 05.7c, 05.7d, 05.9a, 05.9b, 05.9c), so all 23 TEST-05.* pass (F-05 Stage B). The full run
  is saved as `docs/sprints/sprint-1/evidence/F-05-green.txt` as well as the F-04 green evidence.
- The F-05 tests use the real clock with fixed 2026 dates (goal `G1` 2026-01-01..2026-12-31, entries
  in January and February), which stay in the past and inside the goal, so they do not depend on the
  day they are run.
- Before F-04 the suite is `12 failed | 96 passed (108)`; after F-04 it is expected to be
  `0 failed | <108 + number of TEST-04 tests> passed`, with the exact count recorded in the evidence.

## 6. Definition of done

- [x] This contract is committed before any implementation code (separate earlier commit).
- [x] Tests TEST-04.* are committed and fail first (red) because the entry and progress routes are
      missing, not because of compile or configuration errors, with the failing output saved under
      `docs/sprints/sprint-1/evidence/`.
- [x] Implementation makes all TEST-04.* pass (green), with the passing output saved.
- [x] All 23 TEST-05.* pass (F-05 Stage B) and the run is saved as `F-05-green.txt`.
- [x] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests.
- [x] No existing test file is edited.
- [x] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [x] Failed or skipped tests, if any, are listed in the evidence report.
- [x] (v1.2) TEST-04.18 to TEST-04.23 are committed red before the entry screens, then green;
      `npm test` in `frontend/` passes; screenshots of the entry, history and progress journey are
      saved under `docs/sprints/sprint-1/evidence/ui-goals/`.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-07 | Initial contract | Written before implementation |
| 1.1 | 2026-11-07 | Each test sets its clock before logging in (8-hour session); progress percentage and rounding recorded as SRS D-10; TEST-04.6c (future before outside); TEST-04.8a/b and 04.14d run with `TZ` America/Los_Angeles; TEST-05.9c change dropped (no existing test edited); note that TEST-05.9b/c cover 404 before BR-02/BR-01; TEST-04.14e (2 of 3 = 66.67) | PR #29 review |
| 1.2 | 2026-11-07 | Added §3.3 UI, AC-04.18 to AC-04.23 and TEST-04.18 to TEST-04.23 (§5.2, frontend component tests): goal screen with history and progress, empty state, record flow with numeric JSON and progress refreshed from the server, verbatim 400/409 with the form kept, 401 returns to login, disabled submit while in flight; existing-tests section renumbered §5.3 | entry UI, Issue #26 |
| 1.3 | 2026-11-07 | History shows date and value only (no UI-side "target met", BR-09 stays on the server); TEST-04.20 renamed TEST-04.20a; TEST-04.20c added: a failed progress refresh after a saved entry no longer looks like a failed save | PR #31 review |
| 1.4 | 2026-11-07 | Status set to implemented; Definition of done checked against the merged PRs and saved evidence (no change to behaviour, AC or tests) | Part B/D, Sprint 1 close-out |
