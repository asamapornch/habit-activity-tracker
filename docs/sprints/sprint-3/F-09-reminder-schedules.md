# F-09 — Reminder Schedules (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-09 |
| Sprint | 3 |
| Linked requirements | FR-13, FR-14, BR-13; SRS D-20, D-21 (this contract; settled by warunwora on PR #78, 2026-11-28) |
| Depends on | F-01 (`requireRole`), F-03 (goals; `findOwnGoal`-equivalent ownership check) |
| Needed by | — |
| Owner | — (not yet assigned) |
| Reviewer | — (not yet assigned) |
| Status | **Contract written (planned). No code, migration or test exists yet.** |

## 1. Purpose

Let a Participant set, change and remove a reminder schedule (which weekdays, and what time) for one
of their own goals, and see a combined list of upcoming reminders for the next 7 days across all
their goals. **Nothing is delivered** — no email, push notification or any other dispatch exists or
is planned; this feature only stores and displays the schedule (SRS §2.3: "Real notification delivery
... is representation only").

## 2. Smallest meaningful first slice

Deliverable 2 part C asks for "at least one implemented and tested Sprint 3 workflow," not every
F-09 behaviour at once. This contract is written in full, but is split into two independently
shippable slices so the smaller one can be picked up first:

- **Slice 1 (smallest meaningful workflow):** §2.1 to §2.3 below — set, read and remove **one goal's
  own** reminder schedule (`PUT`/`GET`/`DELETE /goals/:id/reminder`). This alone is a complete,
  testable FR-13 workflow: AC-09.1 to AC-09.9, TEST-09.1 to TEST-09.9 (§4, §5).
- **Slice 2:** §2.4 below — the cross-goal "upcoming reminders" list (FR-14,
  `GET /reminders/upcoming`): AC-09.10 to AC-09.13, TEST-09.10 to TEST-09.13. This depends on Slice 1
  existing (it reads the schedules Slice 1 stores) and is naturally the second slice, not the first.

## 2. Behaviour

### 2.1 Set a goal's reminder schedule

`PUT /goals/:id/reminder` (Participant, goal owner) creates or replaces the one reminder schedule for
that goal (FR-13 reads "a reminder schedule" for a goal, singular — **Decision D-20:** at most one schedule per goal, and `PUT` always replaces it wholesale, the same semantics
F-02's `PUT /templates/:id` already uses for "replaces all fields, as today" — not a list of several
schedules per goal, which nothing in the SRS asks for).

Checks run in this order (same pattern as F-03/F-04/F-06/F-07/F-08), and the first failing step
answers:

1. no session: **401**;
2. wrong role (a Manager): **403**;
3. body shape and id format only: **400** `Invalid goal id.` / `Invalid reminder fields.` (malformed
   id; body not an object; missing/unknown keys; wrongly shaped `weekdays`/`time`);
4. goal existence and ownership: **404** `Goal not found.` (identical response for a goal that does
   not exist and a goal of another Participant, BR-08, same as F-03/F-04/F-06/F-07/F-08);
5. BR-13, at least one weekday: **400** `At least one weekday is required.` (an empty `weekdays`
   array);
6. BR-13, a valid time: already enforced by the body-shape step (3) — `time` not matching `HH:MM` is
   a shape error, not a separate rule step, since it needs no stored data to check.

### 2.2 Read a goal's reminder schedule

`GET /goals/:id/reminder` (Participant, goal owner) returns the goal's schedule, or **404**
`No reminder schedule set for this goal.` if none has been set — a different 404 message from "goal
not found" (§2.1 step 4), which is checked first; a missing schedule is a normal, expected state, not
an error about the goal itself.

### 2.3 Remove a goal's reminder schedule

`DELETE /goals/:id/reminder` (Participant, goal owner) removes the goal's schedule. **Decision D-21:** idempotent — returns **204** whether or not a schedule existed, rather
than 404 when there was nothing to delete, following the common REST convention that a delete's
success means "this resource is now absent," which was already true if it never existed. The goal
existence/ownership check (§2.1 step 4) still applies first: deleting the reminder on another
Participant's goal, or a non-existent goal, is 404, as usual.

### 2.4 Upcoming reminders (Slice 2)

`GET /reminders/upcoming` (Participant) lists, across **all** of the caller's own goals that have a
reminder schedule, every (date, time) instance that:

- falls on one of the schedule's weekdays,
- falls within the next 7 days inclusive of today (today, today+1, ..., today+6, Asia/Bangkok), and
- falls within that goal's `startDate` to `endDate` inclusive (BR-13: "produces no reminders outside
  the goal's dates") — a goal that revises its `endDate` earlier (F-06) immediately produces fewer
  upcoming reminders, with no extra bookkeeping needed, since this is computed fresh on each request.

Sorted by date, then time, then `goalId` (for a stable order when two goals share a date and time).
No pagination (bounded to at most 7 days × however many goals the one Participant owns).

Field rules (request body of `PUT /goals/:id/reminder`), checked in step 3 unless stated:

- The body must be a JSON object (not an array or `null`) with exactly the keys `weekdays`, `time`.
  Missing or unknown keys return 400.
- `weekdays`: a JSON array of integers, each `0` to `6` (**Decision D-20 continued:** `0` = Sunday,
  `6` = Saturday, matching JavaScript's `Date.getDay()` so no day-number translation is needed
  anywhere in the implementation), with no duplicate values; an empty array is a shape error only if
  it also contains something invalid — a syntactically valid but empty array is accepted at this step
  and rejected at step 5 (BR-13's "at least one weekday" is a business rule, not a shape rule, so it
  gets its own message and AC).
- `time`: a string matching exactly `HH:MM`, zero-padded, `00:00` to `23:59` (SRS A-02 pattern: a
  plain time-of-day value, not a date; always read as Asia/Bangkok wall-clock time, never converted).

Other decisions:

- A schedule is not versioned or kept as history; `PUT` simply overwrites it (unlike F-06's goal
  revisions, there is no "earlier reminders stay as they were" requirement anywhere in FR-13).
- Out of scope (Sprint 3, this contract): any actual delivery mechanism, snoozing, multiple schedules
  per goal, Manager visibility of schedules.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `PUT /goals/:id/reminder` | Participant (owner) | `{ weekdays, time }` | `200 { goalId, weekdays, time }` | `400`, `401`, `403`, `404` |
| `GET /goals/:id/reminder` | Participant (owner) | none | `200 { goalId, weekdays, time }` | `401`, `403`, `404` |
| `DELETE /goals/:id/reminder` | Participant (owner) | none | `204` (no body) | `401`, `403`, `404` (goal itself, not the schedule) |
| `GET /reminders/upcoming` (Slice 2) | Participant | none | `200 [ { goalId, date, time } ]`, next 7 days, sorted | `401`, `403` |

Error body: `{ "error": { "code", "message" } }` (system SDS §6, unchanged).

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (same as F-03/F-04/F-06/F-07/F-08) |
| 400 | `VALIDATION_ERROR` | `Invalid reminder fields.` | body shape (§2.1 step 3) |
| 400 | `VALIDATION_ERROR` | `At least one weekday is required.` | BR-13 (§2.1 step 5) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01) | Manager |
| 404 | `NOT_FOUND` | `Goal not found.` (same as F-03/F-04/F-06/F-07/F-08) | goal does not exist or belongs to another Participant |
| 404 | `NOT_FOUND` | `No reminder schedule set for this goal.` | `GET` with no schedule set (§2.2) |

No new `ErrorCode` value is needed.

### 3.2 Data (planned migration — described in prose, no migration file in this PR)

New table `ReminderSchedule`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `goalId` | int, unique, FK → `Goal.id` | unique so "at most one schedule per goal" (D-20) is a database constraint, not only an API check |
| `weekdays` | int array (Postgres `integer[]`) | each `0` to `6`, validated in the API |
| `time` | string (`char(5)`) | `HH:MM`, validated in the API |

No existing table is altered. `Goal`, `Template`, `User`, `Entry`, and F-06's planned `GoalRevision`
are all untouched by this feature — reminders read a goal's `startDate`/`endDate` (§2.4) but write
nothing back to it.

**Layers that need no change, and why:** F-01, F-02 routes; F-03's `POST`/`GET /goals`; F-04's entry
and progress routes; F-06/F-07/F-08 (if merged by the time this is implemented) — none of them read
or write a reminder schedule, and reminders never affect progress, streaks or summaries.

### 3.3 UI

Not built in this contract. Planned: a "Reminders" control on the goal screen (F-04 §3.3) to set,
change or remove the schedule, and a separate "Upcoming" panel (Slice 2) listing the next 7 days'
reminders across goals. Full UI AC and STS are written at the start of the implementation phase,
following the same pattern F-03/F-04 used.

## 4. Acceptance criteria

**Slice 1 (FR-13):**

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-09.1 | The owner setting a schedule with valid `weekdays` and `time` on a goal with no existing schedule receives 200 with the stored schedule. | FR-13 |
| AC-09.2 | The owner setting a schedule on a goal that already has one receives 200 with the new schedule replacing the old one entirely (not merged). | FR-13, D-20 |
| AC-09.3 | Anonymous requests to all three Slice 1 endpoints receive 401; a Manager receives 403; nothing is stored or removed. | NFR-02, BR-08 |
| AC-09.4 | A body that is not an object, missing or unknown fields, a `weekdays` that is not an array of integers 0 to 6, a `weekdays` with a duplicate value, or a `time` not matching `HH:MM` return 400 `Invalid reminder fields.`; a malformed `:id` returns 400 `Invalid goal id.` | NFR-05 |
| AC-09.5 | A goal that does not exist and another Participant's goal return the same 404 on all three Slice 1 endpoints. | BR-08 |
| AC-09.6 | An empty `weekdays` array returns 400 `At least one weekday is required.` and nothing is stored or changed. | BR-13 |
| AC-09.7 | `GET /goals/:id/reminder` on a goal with no schedule returns 404 `No reminder schedule set for this goal.`, distinct from a goal-not-found 404. | FR-13 |
| AC-09.8 | `DELETE /goals/:id/reminder` returns 204 whether or not a schedule existed; a subsequent `GET` on the same goal returns the "no schedule" 404. | FR-13, D-21 |
| AC-09.9 | The check order of §2.1 holds: 401 before 400, 403 before 400, 404 (goal) before BR-13's weekday check. | NFR-02, NFR-05, BR-08 |

**Slice 2 (FR-14):**

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-09.10 | `GET /reminders/upcoming` lists every (goal, date, time) instance in the next 7 days (today to today+6, Asia/Bangkok) that matches a weekday in that goal's schedule, across all of the caller's goals that have one. | FR-14 |
| AC-09.11 | An instance that would fall before the goal's `startDate` or after its `endDate` is excluded, even though it matches a scheduled weekday within the 7-day window. | BR-13 |
| AC-09.12 | A goal with no reminder schedule contributes nothing to the list; a Participant with no goals, or none with a schedule, gets an empty list. | FR-14 |
| AC-09.13 | The list is sorted by date, then time, then `goalId`; a Manager receives 403; anonymous receives 401. | FR-14, NFR-02 |

## 5. Software test specification (STS) — planned, not yet written as executable tests

**Slice 1:**

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-09.1 | API/DB integration | AC-09.1 | `P1` `PUT /goals/:G1/reminder` with `{ weekdays: [1,3,5], time: "08:00" }`, no existing schedule | 200; body echoes the schedule; one row stored |
| TEST-09.2 | API/DB integration | AC-09.2 | same `G1`, already has a schedule; `P1` `PUT` with `{ weekdays: [0,6], time: "20:00" }` | 200; `GET` afterward shows only the new schedule, not a merge |
| TEST-09.3a | API integration | AC-09.3 | no cookie: `PUT`, `GET`, `DELETE /goals/:G1/reminder` | 401 `UNAUTHENTICATED` for each |
| TEST-09.3b | API integration | AC-09.3 | `M` on all three | 403 `FORBIDDEN` for each |
| TEST-09.4a | API integration | AC-09.4 | `P1` `PUT` with `weekdays: [7]` (out of range) | 400 `Invalid reminder fields.` |
| TEST-09.4b | API integration | AC-09.4 | `P1` `PUT` with `weekdays: [1,1]` (duplicate) | 400 `Invalid reminder fields.` |
| TEST-09.4c | API integration | AC-09.4 | `P1` `PUT` with `time: "8:00"` and `"24:00"` | 400 `Invalid reminder fields.` for each |
| TEST-09.4d | API integration | AC-09.4 | `P1` `PUT /goals/abc/reminder` | 400 `Invalid goal id.` |
| TEST-09.5 | API/DB integration | AC-09.5 | **control** `P1` sets a schedule (200); `P2` `PUT`/`GET`/`DELETE` the same goal id and a non-existent id | all 404 `Goal not found.`, identical |
| TEST-09.6 | API/DB integration | AC-09.6 | `P1` `PUT` with `weekdays: []` | 400 `At least one weekday is required.`; nothing stored |
| TEST-09.7 | API/DB integration | AC-09.7 | `P1` `GET /goals/:G2/reminder`, `G2` has no schedule | 404 `No reminder schedule set for this goal.` |
| TEST-09.8 | API/DB integration | AC-09.8 | `P1` `DELETE /goals/:G2/reminder` (no schedule existed), then again after `G1` (which has one) | both 204; `GET /goals/:G1/reminder` afterward is the "no schedule" 404 |
| TEST-09.9 | API/DB integration | AC-09.9 | **control** `M` `PUT /goals/:G1/reminder` with `{}` (403, owned by `P1`); then `P2` `PUT` the same with `weekdays: []` | `M` 403; `P2` 404 (ownership before the weekday rule) |

**Slice 2:**

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-09.10 | API/DB integration | AC-09.10 | `P1` has `G1` (Mon/Wed/Fri 08:00) and `G2` (Sun 20:00), both spanning the next 7 days | the upcoming list has exactly the matching dates for each goal in that window |
| TEST-09.11 | API/DB integration | AC-09.11 | `G1`'s schedule matches a weekday that falls the day after `G1.endDate` (inside the 7-day window) | that instance is excluded; later matching instances still inside the goal's dates are included |
| TEST-09.12a | API/DB integration | AC-09.12 | `G2` has no schedule | contributes nothing |
| TEST-09.12b | API/DB integration | AC-09.12 | `P2` owns no goals with a schedule | `GET /reminders/upcoming` returns `[]` |
| TEST-09.13a | API/DB integration | AC-09.13 | `P1` has two goals whose schedules both fire on the same date and time | both appear, ordered by `goalId` |
| TEST-09.13b | API integration | AC-09.13 | no cookie; then `M` | 401; then 403 |

### 5.2 Frontend tests — planned, written when the UI (§3.3) is scoped at the start of implementation.

### 5.3 Regression — must stay unchanged

- All existing `TEST-01.*` to `TEST-08.*` must keep passing unmodified; this feature adds new routes
  and a new table, and touches no existing route, response shape or migration.

## 6. Definition of done

- [ ] This contract is committed before any implementation code (this PR).
- [ ] Migration adding `ReminderSchedule` is written and committed before the route code that uses it.
- [ ] Slice 1 (TEST-09.1 to TEST-09.9) is committed red, then green, before Slice 2 is started —
      satisfying "at least one implemented and tested Sprint 3 workflow" on its own if time is short.
- [ ] Slice 2 (TEST-09.10 to TEST-09.13) is committed red, then green.
- [ ] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests.
- [ ] No existing test file is edited.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [x] The two proposed decisions (D-20, D-21) are resolved by the reviewer before implementation
      starts: warunwora accepted both as written on PR #78 (2026-11-28, https://github.com/asamapornch/habit-activity-tracker/pull/78#issuecomment-7229418473).
- [ ] UI section (§3.3) is filled in with AC/STS at the start of the implementation phase.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Initial contract, written before any implementation | Sprint 3 planning (`docs/sprints/plan.md` §4) |
| 1.1 | 2026-11-27 | Decision IDs renumbered to avoid collision across PRs (D-13 → D-20, D-14 → D-21); no semantic change | Reviewer-facing cleanup before Deliverable 2 review |
| 1.1.1 | 2026-11-28 | D-20 and D-21 settled (warunwora accepted both as written on #78): "(proposed, needs review)" removed from the header, §2.1 and §2.3; §6 item checked. No behaviour, AC or test change. | Comment by warunwora on #78 |
