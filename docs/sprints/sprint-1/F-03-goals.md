# F-03 — Goals (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-03 |
| Sprint | 1 |
| Linked requirements | FR-06, BR-04, BR-05, BR-08, NFR-02, NFR-05 |
| Depends on | F-01 (`requireAuth`, `requireRole`), F-02 (templates), database schema (`Goal`) |
| Needed by | F-04, F-05 |
| Owner | Student 2 |
| Reviewer | Student 1 |
| Status | Implemented and merged into `sprint-1-staging` (PR #25, #27, #31) |

## 1. Purpose

Let a Participant turn a template into a personal goal (for example "Running, 5 km a day, from
1 to 30 November") and read back their own goals. A goal is what later entries (F-04) are recorded
against and what progress is computed from.

## 2. Behaviour

1. **Create** (Participant only) validates the body and stores a goal owned by the caller.
2. **List** (Participant only) returns the caller's own goals and nothing else.
3. **Read one** (Participant only) returns one of the caller's own goals.
4. Checks run in this order on every endpoint (system SDS §4, F-05 §2.5), and the first failing step
   answers:
   1. no session: **401**;
   2. wrong role (a Manager): **403**, before the body or id is looked at;
   3. body shape and id format only: **400** `Invalid goal fields.` / `Invalid goal id.` (missing,
      unknown or wrongly typed fields, malformed dates, too many decimals, malformed id);
   4. existence and ownership: **404** (a template that does not exist on create; a goal that does
      not exist or belongs to another Participant on read);
   5. BR-05, checked as one rule after the template is found: first `endDate` before `startDate`
      (**400** `End date must not be before start date.`), then `dailyTarget` outside the template
      range (**400** `Daily target must be within the template range.`);
   6. BR-04, overlapping goal: **409**.
5. A goal of another Participant and a goal id that does not exist return the **same** 404 status,
   code and message, so existence is not revealed (BR-08).
6. BR-04: a Participant cannot have two goals for the same template whose date ranges overlap,
   start and end dates inclusive: an existing goal overlaps a new one when
   `existing.startDate <= new.endDate` and `new.startDate <= existing.endDate`. Goals that only touch
   (one ends on 10 Nov, the next starts on 11 Nov) do not overlap. Goals of **other** Participants on the
   same template never conflict. Future goals are included (SRS D-08). The check and the insert run
   in one transaction behind a per-(user, template) `pg_advisory_xact_lock`, so concurrent
   overlapping requests produce exactly one 201 and the rest 409 (system SDS §3).
7. The template range used for BR-05 is the template's **current** range. Changing a template's range
   later does not revalidate or change existing goals (SRS D-06); the goal keeps its stored
   `dailyTarget`.

Field rules (request body of `POST /goals`), checked in step 3 unless stated:

- The body must be a JSON object (not an array or `null`) with exactly the keys `templateId`,
  `dailyTarget`, `startDate`, `endDate`. Missing or unknown keys return 400.
- `templateId`: a JSON integer from 1 to 2147483647 (a numeric string such as `"1"`, `0`, `-1` and
  `1.5` are rejected).
- `dailyTarget`: a finite JSON number with at most two decimal places (SRS A-05); a numeric string is
  rejected. Values such as `0.07` and `1.15` (which a naive `x * 100 % 1` check would wrongly reject)
  are accepted.
- `startDate`, `endDate`: strings in exactly `YYYY-MM-DD` form that are real calendar dates
  (`2026-02-30`, `01/11/2026` and a timestamp such as `2026-11-01T00:00:00Z` are rejected).
- BR-05, checked in step 5 after the template is found: `endDate` must not be before `startDate`
  (`endDate` equal to `startDate`, a one-day goal, is allowed); then `dailyTarget` must lie within the
  template's `minValue` and `maxValue`, inclusive, compared after rounding to two decimals (SRS D-07).

Other decisions:

- `dailyTarget` has no rule beyond the template range: `0` and negative targets are accepted when
  they lie inside the template range (for example a temperature template from -20 to 50).
- A start date in the past is allowed (SRS D-09). No F-03 rule depends on "today" (SRS A-02 applies
  only to F-04).
- `GET /goals` returns goals ordered by `id` ascending.
- Dates are returned as `YYYY-MM-DD` strings (system SDS §6); `dailyTarget` as a JSON number.
- `:id` that is not a positive integer, or is greater than 2147483647, returns `400 VALIDATION_ERROR`
  (same rule as templates, F-02 AC-02.8).

Out of scope (Sprint 1): editing or deleting a goal (goal revision is Sprint 2, SRS D-03), goal
status (active/finished) fields, Manager views of goals.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /goals` | Participant | `{ templateId, dailyTarget, startDate, endDate }` | `201 { id, userId, templateId, dailyTarget, startDate, endDate }` | `400`, `401`, `403`, `404`, `409` |
| `GET /goals` | Participant | none | `200 [ { id, userId, templateId, dailyTarget, startDate, endDate } ]` (own goals only) | `401`, `403` |
| `GET /goals/:id` | Participant (owner) | none | `200 { id, userId, templateId, dailyTarget, startDate, endDate }` | `400`, `401`, `403`, `404` |

Error body: `{ "error": { "code", "message" } }`.

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid goal fields.` | body shape (step 3) |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (step 3) |
| 400 | `VALIDATION_ERROR` | `End date must not be before start date.` | BR-05, dates (step 5) |
| 400 | `VALIDATION_ERROR` | `Daily target must be within the template range.` | BR-05, target (step 5) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01 `requireAuth`/`requireRole`) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01 `requireRole`) | Manager |
| 404 | `NOT_FOUND` | `Template not found.` | `POST /goals` with a template id that does not exist |
| 404 | `NOT_FOUND` | `Goal not found.` | goal that does not exist or belongs to another Participant |
| 409 | `CONFLICT` | `You already have a goal for this template that overlaps these dates.` | BR-04 |

`CONFLICT` is a new code added to the shared `ErrorCode` type in this feature. F-04 reuses it for
BR-01 (duplicate entry date).

### 3.2 Data

Table `Goal`: `id`, `userId` (foreign key to `User`), `templateId` (foreign key to `Template`),
`dailyTarget` (float, two decimals), `startDate` and `endDate` (calendar dates), as in the system SDS.
No schema change is needed. BR-04 is enforced in the API (transaction plus advisory lock), not by a
database constraint (system SDS §3).

### 3.3 UI

Added in v1.2 (Issue #26). A signed-in Participant sees a **Goals** section under the template list,
with a create form (template select, daily target with step 0.01, start and end date inputs) and a
list of their own goals (template name, daily target with the template unit, start to end date),
each with an **Open** control that shows the F-04 goal screen. A Manager does not see the Goals
section. Server messages are shown as returned; a `401` returns to the login screen. The UI is a
convenience; the API enforces every rule.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-03.1 | A Participant creating a goal with valid fields receives 201 with the stored goal, including its `id` and `userId` equal to the caller's id; the goal is stored. | FR-06 |
| AC-03.2 | Anonymous requests to `POST /goals`, `GET /goals` and `GET /goals/:id` receive 401. | NFR-02 |
| AC-03.3 | A Manager calling `POST /goals`, `GET /goals` or `GET /goals/:id` receives 403, and no goal is stored. | BR-08, NFR-02 |
| AC-03.4 | A body that is not an object, missing fields, unknown fields, wrongly typed values (including numeric strings), a `dailyTarget` with more than two decimals, a malformed or impossible date, or a `templateId` that is not an integer from 1 to 2147483647 return 400 `Invalid goal fields.` and nothing is stored; two-decimal values such as 0.07 and 1.15 are accepted. | NFR-05, SRS A-05 |
| AC-03.5 | For an existing template, an `endDate` before `startDate` returns 400 `End date must not be before start date.` and nothing is stored; `endDate` equal to `startDate` is accepted. | BR-05 |
| AC-03.6 | A `templateId` that does not exist returns 404 `Template not found.` and nothing is stored. | NFR-05 |
| AC-03.7 | A `dailyTarget` below the template minimum or above the template maximum returns 400 `Daily target must be within the template range.` and nothing is stored; a target equal to the minimum or the maximum, including 0 and a negative minimum, is accepted. | BR-05 |
| AC-03.8 | A second goal of the same Participant on the same template whose dates overlap an existing goal (including a future goal, an enclosing range and ranges that share only one day) returns 409 `CONFLICT` and nothing is stored. | BR-04 |
| AC-03.9 | A goal on the same template that does not overlap (ends the day before or starts the day after an existing goal), a goal on another template, and another Participant's goal on the same template with the same dates are all accepted. | BR-04 |
| AC-03.10 | Concurrent overlapping create requests for the same Participant and template result in exactly one 201, all others 409, and exactly one goal stored. | BR-04 |
| AC-03.11 | `GET /goals` returns only the caller's own goals, ordered by `id`. | FR-06, BR-08 |
| AC-03.12 | `GET /goals/:id` returns the owner's goal with 200; another Participant's goal and a non-existent id return the same 404 (status, code and message); a malformed id returns 400 `Invalid goal id.` | FR-06, BR-08 |
| AC-03.13 | After a Manager changes a template's range, an existing goal on that template is unchanged (same `dailyTarget`), and a new goal is validated against the new range. | SRS D-06 |
| AC-03.14 | The check order of Behaviour 4 holds when a request has several faults: 401 before 400, 403 before 400, 404 before BR-05 400, and BR-05 400 before BR-04 409. | NFR-02, NFR-05, BR-08 |
| AC-03.15 | A signed-in Participant sees their own goals with template name, daily target and unit, and dates; a loading message is shown while they are fetched, and an error message if the request fails. | FR-06 |
| AC-03.16 | Only a Participant sees the Goals section; a Manager does not. | BR-06, FR-06 |
| AC-03.17 | Creating a goal sends `POST /goals` with `templateId` and `dailyTarget` as JSON numbers and both dates as `YYYY-MM-DD`; the new goal appears in the list. | FR-06 |
| AC-03.18 | A 400, 404 or 409 from `POST /goals` is shown with the server's message verbatim, and the form keeps what was typed. | BR-04, BR-05, NFR-05 |
| AC-03.19 | A `401` from any goal request returns the user to the login screen. | NFR-02 |
| AC-03.20 | The create button is disabled while the request is in flight. | NFR-05 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/goals.test.ts`. Each test creates its
own Manager `M` and two Participants `P1`, `P2` in `beforeEach` (bcrypt-hashed) and logs in through
the real `POST /auth/login` from F-01, keeping each cookie. Fixture records (templates, existing
goals) are inserted directly through Prisma so the tests do not depend on endpoints they are not
testing. The shared setup resets the test database before every test. Template `T` is
`{ "Running", "km", 0, 50 }`; template `T2` is `{ "Reading", "minutes", 0, 300 }`; template `T3` is
`{ "Outdoor temperature", "°C", -20, 50 }`. The valid body `B` is
`{ templateId: T.id, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-11-30" }`; each test
changes only the fields it names.

Every rejection test asserts status, `error.code` and the exact `error.message` from §3.1, and that
the goal table is unchanged ("nothing stored"). Messages used below:
`AUTH` = `Authentication required.`, `ROLE` = `You do not have permission to perform this action.`,
`FIELDS` = `Invalid goal fields.`, `ID` = `Invalid goal id.`,
`DATES` = `End date must not be before start date.`, `RANGE` = `Daily target must be within the template range.`,
`TPL404` = `Template not found.`, `GOAL404` = `Goal not found.`,
`OVERLAP` = `You already have a goal for this template that overlaps these dates.`

Tests marked **control** first send the same request with only one fault and assert the real error,
so a 404 from a missing route cannot make them pass.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-03.1a | AC-03.1 | `P1` `POST /goals` with `B` | 201; body equals `B` plus an `id`; `userId` is `P1`'s id; dates are `YYYY-MM-DD`; one goal stored |
| TEST-03.1b | AC-03.1, AC-03.4 | `P1` `POST /goals` with `dailyTarget` 2.5, then (on `T2`) 0.07, then (on `T3`) 1.15 | 201 for each with the same `dailyTarget` returned |
| TEST-03.2 | AC-03.2 | no cookie: `POST /goals` with `B`, `GET /goals`, `GET /goals/1` | 401 `UNAUTHENTICATED` `AUTH` for each; nothing stored |
| TEST-03.3a | AC-03.3 | `M` `POST /goals` with `B` | 403 `FORBIDDEN` `ROLE`; nothing stored |
| TEST-03.3b | AC-03.3 | `M` `GET /goals` and `GET /goals/:id` of `P1`'s goal | 403 `FORBIDDEN` `ROLE` for each |
| TEST-03.4a | AC-03.4 | `P1` `POST /goals` with `{}` | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4b | AC-03.4 | `P1` `POST /goals` with `B` plus `"note": "x"` | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4c | AC-03.4 | `P1` `POST /goals` with `templateId` `"1"` (string) | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4d | AC-03.4 | `P1` `POST /goals` with `dailyTarget` `"5"` (string) | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4e | AC-03.4 | `P1` `POST /goals` with `dailyTarget` 5.123 | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4f | AC-03.4 | `P1` `POST /goals` with `startDate` `"01/11/2026"`, then `"2026-11-01T00:00:00Z"` | 400 `VALIDATION_ERROR` `FIELDS` for each; nothing stored |
| TEST-03.4g | AC-03.4 | `P1` `POST /goals` with `endDate` `"2026-02-30"` | 400 `VALIDATION_ERROR` `FIELDS`; nothing stored |
| TEST-03.4h | AC-03.4 | `P1` `POST /goals` with `templateId` 0, -1, 1.5 and 99999999999 | 400 `VALIDATION_ERROR` `FIELDS` for each (not 404 or 500); nothing stored |
| TEST-03.4i | AC-03.4 | `P1` `POST /goals` with body `[]`, then `null` (sent as JSON) | 400 `VALIDATION_ERROR` `FIELDS` for each; nothing stored |
| TEST-03.5a | AC-03.5 | `P1` `POST /goals` with `startDate` `"2026-11-30"`, `endDate` `"2026-11-01"` | 400 `VALIDATION_ERROR` `DATES`; nothing stored |
| TEST-03.5b | AC-03.5 | `P1` `POST /goals` with `startDate` = `endDate` = `"2026-11-15"` | 201 |
| TEST-03.6 | AC-03.6 | `P1` `POST /goals` with `templateId` 99999 | 404 `NOT_FOUND` `TPL404`; nothing stored |
| TEST-03.7a | AC-03.7 | `P1` `POST /goals` on `T` (0–50) with `dailyTarget` 51 | 400 `VALIDATION_ERROR` `RANGE`; nothing stored |
| TEST-03.7b | AC-03.7 | same with `dailyTarget` -1 | 400 `VALIDATION_ERROR` `RANGE`; nothing stored |
| TEST-03.7c | AC-03.7 | `P1` posts on `T` with `dailyTarget` 0, on `T2` with 300, and on `T3` with -20 | 201 for each (inclusive bounds; 0 and negative accepted) |
| TEST-03.8a | AC-03.8 | `P1` has a goal on `T` 2026-11-01..2026-11-30; `P1` posts `T` 2026-11-15..2026-12-15 | 409 `CONFLICT` `OVERLAP`; still one goal |
| TEST-03.8b | AC-03.8 | same existing goal; `P1` posts `T` 2026-11-30..2026-12-31 (shares only the last day) | 409 `CONFLICT` `OVERLAP`; still one goal |
| TEST-03.8c | AC-03.8 | `P1` has a future goal on `T` 2099-01-01..2099-01-31; `P1` posts `T` 2098-12-15..2099-01-05 | 409 `CONFLICT` `OVERLAP`; still one goal |
| TEST-03.8d | AC-03.8 | same existing goal as 03.8a; `P1` posts `T` 2026-10-01..2026-12-31 (encloses it) | 409 `CONFLICT` `OVERLAP`; still one goal |
| TEST-03.9a | AC-03.9 | same existing goal as 03.8a; `P1` posts `T` 2026-12-01..2026-12-31, then `T` 2026-10-01..2026-10-31 | 201 for each; three goals stored |
| TEST-03.9b | AC-03.9 | same existing goal; `P1` posts `T2` 2026-11-01..2026-11-30 | 201 |
| TEST-03.9c | AC-03.9 | same existing goal (owned by `P1`); `P2` posts `T` 2026-11-01..2026-11-30 | 201 |
| TEST-03.10 | AC-03.10 | `P1` sends five overlapping `POST /goals` on `T` at the same time (`Promise.all`, different but overlapping ranges) | exactly one 201 and four 409 `CONFLICT` `OVERLAP`; one goal stored |
| TEST-03.11 | AC-03.11 | `P1` owns two goals, `P2` owns one; `P1` and `P2` each `GET /goals` | 200; `P1` gets exactly its two goals ordered by `id`; `P2` gets only its one |
| TEST-03.12a | AC-03.12 | `P1` `GET /goals/:id` of its own goal | 200; body equals the stored goal |
| TEST-03.12b | AC-03.12 | **control** `P1` `GET /goals/:id` of own goal; then `P2` `GET` the same id; `P2` `GET /goals/99999` | `P1` 200; both `P2` responses 404 `NOT_FOUND` `GOAL404`, identical code and message |
| TEST-03.12c | AC-03.12 | `P1` `GET /goals/abc`, `GET /goals/0` and `GET /goals/99999999999` | 400 `VALIDATION_ERROR` `ID` for each |
| TEST-03.13 | AC-03.13 | `P1` has a goal on `T` with `dailyTarget` 40; `M` `PUT /templates/:T` to range 0–20; `P1` `GET /goals/:id`; then `P1` posts on `T` 2027-01-01..2027-01-31 with `dailyTarget` 30 | existing goal still `dailyTarget` 40; new goal 400 `VALIDATION_ERROR` `RANGE`, nothing new stored |
| TEST-03.14a | AC-03.14 | no cookie: `POST /goals` with `{}` | 401 `UNAUTHENTICATED` `AUTH` (not 400) |
| TEST-03.14b | AC-03.14 | `M` `POST /goals` with `{}`; `M` `GET /goals/abc` | 403 `FORBIDDEN` `ROLE` for each (not 400) |
| TEST-03.14c | AC-03.14 | **control** `P1` posts `B` with `dailyTarget` 999 (400 `RANGE`) and `B` with `templateId` 99999 (404 `TPL404`); then `P1` posts `templateId` 99999 **and** `dailyTarget` 999 | controls as stated; the combined request gives 404 `NOT_FOUND` `TPL404` (not 400); nothing stored |
| TEST-03.14d | AC-03.14 | **control** `P1` posts `B` with `startDate` `"2026-11-30"`, `endDate` `"2026-11-01"` (400 `DATES`); then the same dates with `templateId` 99999 | combined request gives 404 `NOT_FOUND` `TPL404` (not 400); nothing stored |
| TEST-03.14e | AC-03.14 | `P1` has a goal on `T` 2026-11-01..2026-11-30; **control** `P1` posts `T` 2026-11-15..2026-12-15 with `dailyTarget` 5 (409 `OVERLAP`); then the same range with `dailyTarget` 999 | combined request gives 400 `VALIDATION_ERROR` `RANGE` (not 409); still one goal |

### 5.2 Frontend tests

Component tests (Vitest + React Testing Library) in `frontend/src/Goals.test.tsx`, with `fetch`
mocked per test. Templates: `T` Running (km, 0–50), `T2` Reading (minutes, 0–300).

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-03.15a | AC-03.15 | `GET /goals` left pending, then resolved with one goal on `T` | a loading message is shown first; then the goal row shows `Running`, `5 km` and `2026-11-01 → 2026-11-30`; the loading message is gone |
| TEST-03.15b | AC-03.15 | `GET /goals` rejected | an error message (`role="alert"`) is shown, not an endless loading state |
| TEST-03.16 | AC-03.16 | `App` rendered as a Participant, then (fresh render) as a Manager; `GET /templates` and `GET /goals` return lists | Participant: a `Goals` heading and the create-goal form are shown; Manager: neither is shown and `GET /goals` is never called |
| TEST-03.17 | AC-03.17 | Participant selects `T2`, types target `2.5`, start `2026-11-01`, end `2026-11-30`, submits; `POST /goals` returns 201 | `POST /goals` called once with `{ templateId: 2, dailyTarget: 2.5, startDate: "2026-11-01", endDate: "2026-11-30" }` (numbers are JSON numbers); the new goal appears in the list |
| TEST-03.18a | AC-03.18 | `POST /goals` mocked to 409 `You already have a goal for this template that overlaps these dates.` | that exact message is shown; the target and date fields still hold what was typed |
| TEST-03.18b | AC-03.18 | `POST /goals` mocked to 400 `Daily target must be within the template range.` | that exact message is shown; the target field still holds what was typed; no goal is added |
| TEST-03.19 | AC-03.19 | `App` as a Participant; `GET /goals` mocked to 401 | the login form is shown |
| TEST-03.20 | AC-03.20 | `POST /goals` left pending | the create button is disabled until the request resolves |

### 5.3 Expected F-05 state after this feature

The F-05 tests that exercise only F-03 endpoints turn green: TEST-05.1c, 05.3a, 05.3b, 05.3c, 05.4a,
05.6, 05.7a (7 tests). The other 12 stay red because the F-04 endpoints are still missing, each
failing on a status mismatch (Express's default 404), not on an error: TEST-05.1d, 05.3d, 05.3e,
05.4b, 05.4c, 05.5, 05.7b, 05.7c, 05.7d, 05.9a, 05.9b, 05.9c. Before F-03 the suite is
`19 failed | 51 passed (70)`; after F-03 it is expected to be `12 failed | <51 + 7 + number of TEST-03 tests> passed`, with
the exact counts recorded in the green evidence.

## 6. Definition of done

- [x] This contract is committed before any implementation code (separate earlier commit).
- [x] Tests TEST-03.* are committed and fail first (red) because the goal routes are missing, not
      because of compile or configuration errors, with the failing output saved under
      `docs/sprints/sprint-1/evidence/`.
- [x] Implementation makes all TEST-03.* pass (green), with the passing output saved.
- [x] `npm test` in `backend/` from a clean checkout: all F-01, F-02 and TEST-03.* tests pass, the 7
      F-05 tests in §5.3 pass, and exactly the 12 F-05 tests listed in §5.3 are red for the stated reason.
- [x] No existing test file is edited.
- [x] `CONFLICT` is added to the shared `ErrorCode` type used by the error handler.
- [x] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [x] Failed or skipped tests, if any, are listed in the evidence report.
- [x] (v1.2) TEST-03.15 to TEST-03.20 are committed red before the goal screens, then green;
      `npm test` in `frontend/` passes; screenshots of the goal journey are saved under
      `docs/sprints/sprint-1/evidence/ui-goals/`.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-07 | Initial contract | Written before implementation |
| 1.1 | 2026-11-07 | Check order tested (AC-03.14, TEST-03.14a to e, with positive controls); `endDate` before `startDate` moved from the 400 shape step to BR-05 after the template 404, with its own message; exact code and message (including F-01's 401/403 messages) and "nothing stored" in every rejection test; D-09 (past start date) added to the SRS, `dailyTarget` 0/negative and "no rule depends on today" stated; 5 concurrent requests in TEST-03.10; 0.07/1.15, `templateId` -1, array/null body and timestamp date cases; TEST-03.8c uses 2099; expected F-05 red set listed (§5.1); UI tracked in Issue #26 | PR #25 review |
| 1.2 | 2026-11-07 | Added §3.3 UI, AC-03.15 to AC-03.20 and TEST-03.15 to TEST-03.20 (§5.2, frontend component tests): own goal list with loading/error states, Participant-only section, create flow with numeric JSON, verbatim 400/404/409 with the form kept, 401 returns to login, disabled submit while in flight; F-05 section renumbered §5.3 | goal UI, Issue #26 |
| 1.3 | 2026-11-07 | Status set to implemented; Definition of done checked against the merged PRs and saved evidence (no change to behaviour, AC or tests) | Part B/D, Sprint 1 close-out |
