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
| Status | Contract written before implementation |

## 1. Purpose

Let a Participant turn a template into a personal goal (for example "Running, 5 km a day, from
1 to 30 November") and read back their own goals. A goal is what later entries (F-04) are recorded
against and what progress is computed from.

## 2. Behaviour

1. **Create** (Participant only) validates the body and stores a goal owned by the caller.
2. **List** (Participant only) returns the caller's own goals and nothing else.
3. **Read one** (Participant only) returns one of the caller's own goals.
4. Checks run in this order on every endpoint (system SDS §4, F-05 §2):
   1. no session: **401**;
   2. wrong role (a Manager): **403**, before any lookup;
   3. body shape and id format: **400** (see field rules below);
   4. existence and ownership: **404** (template that does not exist on create; goal that does not
      exist or belongs to another Participant on read);
   5. checks that depend on stored data: **400** for BR-05 (daily target outside the template's
      range), then **409** for BR-04 (overlapping goal).
5. A goal of another Participant and a goal id that does not exist return the **same** 404 status,
   code and message, so existence is not revealed (BR-08).
6. BR-04: a Participant cannot have two goals for the same template whose date ranges overlap,
   start and end dates inclusive: an existing goal overlaps a new one when
   `existing.startDate <= new.endDate` and `new.startDate <= existing.endDate`. Goals that only touch
   (one ends on 10 Nov, the next starts on 11 Nov) do not overlap. Goals of **other** Participants on the
   same template never conflict. Future goals are included (SRS D-08). The check and the insert run
   in one transaction behind a per-(user, template) `pg_advisory_xact_lock`, so two concurrent
   overlapping requests produce one 201 and one 409 (system SDS §3).
7. The template range used for BR-05 is the template's **current** range. Changing a template's range
   later does not revalidate or change existing goals (SRS D-06); the goal keeps its stored
   `dailyTarget`.

Field rules (request body of `POST /goals`):

- The body must be a JSON object with exactly the keys `templateId`, `dailyTarget`, `startDate`,
  `endDate`. Missing or unknown keys return 400.
- `templateId`: a JSON integer from 1 to 2147483647 (a numeric string such as `"1"` is rejected).
- `dailyTarget`: a finite JSON number with at most two decimal places (SRS A-05); a numeric string is
  rejected.
- `startDate`, `endDate`: strings in `YYYY-MM-DD` form that are real calendar dates (`2026-02-30` is
  rejected).
- `endDate` must not be before `startDate` (BR-05, second half). This needs only the body, so it is
  part of the 400 shape step and is answered before the template lookup. `endDate` equal to
  `startDate` (a one-day goal) is allowed.
- `dailyTarget` must lie within the template's `minValue` and `maxValue`, inclusive (BR-05, first
  half), compared after rounding to two decimals (SRS D-07). This needs the template, so it is
  checked after the 404 step.

Other decisions:

- A start date in the past is allowed (back-dating is allowed for entries too, SRS D-02); there is no
  rule against it in the SRS.
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
| 400 | `VALIDATION_ERROR` | `Invalid goal fields.` / `Invalid goal id.` | body shape, `endDate` before `startDate`, malformed id |
| 400 | `VALIDATION_ERROR` | `Daily target must be within the template range.` | BR-05 target outside the template range |
| 401 | `UNAUTHENTICATED` | (from F-01) | no valid session |
| 403 | `FORBIDDEN` | (from F-01) | Manager |
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

Not part of this contract version. The goal screens are added in a later version together with the
F-04 entry and progress screens.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-03.1 | A Participant creating a goal with valid fields receives 201 with the stored goal, including its `id` and `userId` equal to the caller's id; the goal is stored. | FR-06 |
| AC-03.2 | Anonymous requests to `POST /goals`, `GET /goals` and `GET /goals/:id` receive 401. | NFR-02 |
| AC-03.3 | A Manager calling `POST /goals`, `GET /goals` or `GET /goals/:id` receives 403, and no goal is stored. | BR-08, NFR-02 |
| AC-03.4 | Missing fields, unknown fields, wrongly typed values (including numeric strings), a `dailyTarget` with more than two decimals, a malformed or impossible date, or a `templateId` that is not an integer from 1 to 2147483647 return 400 and nothing is stored. | NFR-05 |
| AC-03.5 | An `endDate` before `startDate` returns 400 and nothing is stored; `endDate` equal to `startDate` is accepted. | BR-05 |
| AC-03.6 | A `templateId` that does not exist returns 404 and nothing is stored. | NFR-05 |
| AC-03.7 | A `dailyTarget` below the template minimum or above the template maximum returns 400 and nothing is stored; a target equal to the minimum or the maximum is accepted. | BR-05 |
| AC-03.8 | A second goal of the same Participant on the same template whose dates overlap an existing goal (including a future goal and ranges that share only one day) returns 409 `CONFLICT` and nothing is stored. | BR-04 |
| AC-03.9 | A goal on the same template that does not overlap (ends the day before or starts the day after an existing goal), a goal on another template, and another Participant's goal on the same template with the same dates are all accepted. | BR-04 |
| AC-03.10 | Two concurrent overlapping create requests for the same Participant and template result in exactly one 201 and one 409, and exactly one goal is stored. | BR-04 |
| AC-03.11 | `GET /goals` returns only the caller's own goals, ordered by `id`. | FR-06, BR-08 |
| AC-03.12 | `GET /goals/:id` returns the owner's goal with 200; another Participant's goal and a non-existent id return the same 404 (status, code and message); a malformed id returns 400. | FR-06, BR-08 |
| AC-03.13 | After a Manager changes a template's range, an existing goal on that template is unchanged (same `dailyTarget`), and a new goal is validated against the new range. | SRS D-06 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/goals.test.ts`. Each test creates its
own Manager and two Participants in `beforeEach` (bcrypt-hashed) and logs in through the real
`POST /auth/login` from F-01, keeping each cookie. Fixture records (templates, existing goals) are
inserted directly through Prisma so the tests do not depend on the create endpoints they are not
testing. The shared setup resets the test database before every test. Template `T` is
`{ "Running", "km", 0, 50 }`; template `T2` is `{ "Reading", "minutes", 0, 300 }`.

Rejection tests assert the error code and message, not only the status, and assert that the goal
table did not change.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-03.1a | AC-03.1 | `P1` `POST /goals` with `{ T.id, 5, "2026-11-01", "2026-11-30" }` | 201; body matches input with an `id`; `userId` equals `P1`'s id; dates are `YYYY-MM-DD`; one goal stored |
| TEST-03.1b | AC-03.1 | `P1` `POST /goals` with `dailyTarget` 2.5 | 201; `dailyTarget` 2.5 |
| TEST-03.2 | AC-03.2 | no cookie: `POST /goals`, `GET /goals`, `GET /goals/1` | 401 `UNAUTHENTICATED` for each; nothing stored |
| TEST-03.3a | AC-03.3 | `M` `POST /goals` with a valid body | 403 `FORBIDDEN`; goal table empty |
| TEST-03.3b | AC-03.3 | `M` `GET /goals` and `GET /goals/:id` of `P1`'s goal | 403 for each |
| TEST-03.4a | AC-03.4 | `P1` `POST /goals` with `{}` | 400 `VALIDATION_ERROR`; nothing stored |
| TEST-03.4b | AC-03.4 | `P1` `POST /goals` with an extra field `"note"` | 400 |
| TEST-03.4c | AC-03.4 | `P1` `POST /goals` with `templateId` `"1"` (string) | 400 |
| TEST-03.4d | AC-03.4 | `P1` `POST /goals` with `dailyTarget` `"5"` (string) | 400 |
| TEST-03.4e | AC-03.4 | `P1` `POST /goals` with `dailyTarget` 5.123 | 400 |
| TEST-03.4f | AC-03.4 | `P1` `POST /goals` with `startDate` `"01/11/2026"` | 400 |
| TEST-03.4g | AC-03.4 | `P1` `POST /goals` with `endDate` `"2026-02-30"` | 400 |
| TEST-03.4h | AC-03.4 | `P1` `POST /goals` with `templateId` 0, 1.5 and 99999999999 | 400 for each, not 404 or 500 |
| TEST-03.5a | AC-03.5 | `P1` `POST /goals` with `startDate` `"2026-11-30"`, `endDate` `"2026-11-01"` | 400 `VALIDATION_ERROR`; nothing stored |
| TEST-03.5b | AC-03.5 | `P1` `POST /goals` with `startDate` = `endDate` = `"2026-11-15"` | 201 |
| TEST-03.6 | AC-03.6 | `P1` `POST /goals` with `templateId` 99999 and an otherwise valid body | 404 `NOT_FOUND` `Template not found.`; nothing stored |
| TEST-03.7a | AC-03.7 | `P1` `POST /goals` on `T` (0–50) with `dailyTarget` 51 | 400 `VALIDATION_ERROR` `Daily target must be within the template range.`; nothing stored |
| TEST-03.7b | AC-03.7 | same with `dailyTarget` -1 | 400 |
| TEST-03.7c | AC-03.7 | same with `dailyTarget` 0, then (on `T2`) 300 | 201 for each (inclusive bounds) |
| TEST-03.8a | AC-03.8 | `P1` has a goal on `T` 2026-11-01..2026-11-30; `P1` posts `T` 2026-11-15..2026-12-15 | 409 `CONFLICT`; still one goal |
| TEST-03.8b | AC-03.8 | same existing goal; `P1` posts `T` 2026-11-30..2026-12-31 (shares only the last day) | 409 |
| TEST-03.8c | AC-03.8 | `P1` has a future goal on `T` 2027-01-01..2027-01-31; `P1` posts `T` 2026-12-15..2027-01-05 | 409 |
| TEST-03.8d | AC-03.8 | same existing goal as 03.8a; `P1` posts `T` 2026-10-01..2026-12-31 (encloses it) | 409 |
| TEST-03.9a | AC-03.9 | same existing goal as 03.8a; `P1` posts `T` 2026-12-01..2026-12-31, then `T` 2026-10-01..2026-10-31 | 201 for each |
| TEST-03.9b | AC-03.9 | same existing goal; `P1` posts `T2` 2026-11-01..2026-11-30 | 201 |
| TEST-03.9c | AC-03.9 | same existing goal (owned by `P1`); `P2` posts `T` 2026-11-01..2026-11-30 | 201 |
| TEST-03.10 | AC-03.10 | `P1` sends two overlapping `POST /goals` on `T` at the same time (`Promise.all`) | statuses are exactly one 201 and one 409; one goal stored |
| TEST-03.11 | AC-03.11 | `P1` owns two goals, `P2` owns one; `P1` and `P2` each `GET /goals` | `P1` gets its two goals ordered by `id`; `P2` gets only its one |
| TEST-03.12a | AC-03.12 | `P1` `GET /goals/:id` of its own goal | 200; body equals the stored goal |
| TEST-03.12b | AC-03.12 | `P1` `GET /goals/:id` of own goal (control); `P2` `GET` the same id; `P2` `GET /goals/99999` | `P1` 200; both `P2` responses 404 `NOT_FOUND` with identical code and message |
| TEST-03.12c | AC-03.12 | `P1` `GET /goals/abc` and `GET /goals/99999999999` | 400 for each |
| TEST-03.13 | AC-03.13 | `P1` has a goal on `T` with `dailyTarget` 40; `M` `PUT /templates/:T` to range 0–20; `P1` `GET /goals/:id`; then `P1` posts a goal on `T` (non-overlapping dates) with `dailyTarget` 30 | existing goal still `dailyTarget` 40; new goal 400 (outside the new range) |

The F-05 tests that exercise these endpoints (TEST-05.1c, 05.3a to 05.3c, 05.4a, 05.6, 05.7a) are
expected to turn green with this feature; the rest of TEST-05.* need F-04.

## 6. Definition of done

- [ ] This contract is committed before any implementation code (separate earlier commit).
- [ ] Tests TEST-03.* are committed and fail first (red) because the goal routes are missing, not
      because of compile or configuration errors, with the failing output saved under
      `docs/sprints/sprint-1/evidence/`.
- [ ] Implementation makes all TEST-03.* pass (green), with the passing output saved.
- [ ] `npm test` in `backend/` passes from a clean checkout for all F-01 and F-02 tests and the F-05
      tests listed in §5; the remaining F-05 tests (F-04 endpoints) are still red for the right reason.
- [ ] No existing test file is edited.
- [ ] `CONFLICT` is added to the shared `ErrorCode` type used by the error handler.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-07 | Initial contract | Written before implementation |
