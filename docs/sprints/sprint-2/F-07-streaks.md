# F-07 — Streaks (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-07 |
| Sprint | 2 |
| Linked requirements | FR-11, BR-11, BR-12; SRS D-16, D-17 (this contract; accepted as written by warunwora in the #77 approval, 2026-11-28) |
| Depends on | F-01 (`requireRole`), F-04 (entries; `findOwnGoal`, BR-09's `lastDay` boundary), **F-06** (goal revisions; §3.4 "target in effect per day" and end date in effect; merged in #84) |
| Needed by | — |
| Owner | warunwora (Student 2) |
| Reviewer | asamapornch (Student 1) |
| Status | **v1.5: UI AC/STS added at implementation start. Implementation in progress on `feature/f07-streaks` (Issue #80).** |

**Dependency note:** this feature must not be merged before F-06 is merged to `sprint-1-staging`; it
may be implemented and tested on a branch stacked on F-06's feature branch (PR base = that branch)
because `effectiveOn()` is available there, since every streak day's target comes from F-06's
`effectiveOn(goal, date, "dailyTarget")` lookup (§3.4 of that contract). `docs/sprints/plan.md`
§3 states this dependency explicitly ("F-07 ... need[s] F-06's target-in-effect rule"). This contract
can be written and reviewed independently of F-06's PR, but its Definition of Done (§6) cannot be
checked off until F-06 ships.

## 1. Purpose

Let a Participant see how many consecutive days in a row they have met their daily target on one of
their own goals (the **current streak**) and the longest such run they have ever had on that goal
(the **longest streak**) — motivating feedback beyond the raw progress percentage F-04 already shows.

## 2. Behaviour

1. **Streaks** (`GET /goals/:id/streaks`, Participant, goal owner) returns the current and longest
   streak for that goal.
2. Checks run in this order (same pattern as F-03/F-04/F-06), and the first failing step answers:
   1. no session: **401**;
   2. wrong role (a Manager): **403**;
   3. body shape and id format only: **400** `Invalid goal id.` (malformed `:id`; there is no request
      body);
   4. goal existence and ownership: **404** `Goal not found.` (identical response for a goal that
      does not exist and a goal of another Participant, BR-08, same as F-03/F-04/F-06).
3. Let `lastDay` be the earlier of today (Asia/Bangkok) and the goal's **end date in effect today**
   (F-06 §3.2/§3.4, `effectiveOn(goal, revisions, today, "endDate")` — not the stored `Goal.endDate`
   column; **note for the implementer, added after a review finding on F-06 PR #76**: F-06 v1.3
   wrongly claimed several callers needed no change for `endDate`, F-07 included by implication
   through this same `lastDay` definition — use the effective end date here once F-07 has code, the
   same boundary F-04's BR-09 and F-06's own progress/entry/overlap fixes already use). **Decision
   D-16 (settled, #77):** BR-12's wording anchors the current streak on
   "today," which only makes sense while the goal is still active; this contract generalises that
   anchor to `lastDay` so a streak can still be read after a goal has ended, rather than always
   reporting 0 for a finished goal. If the review prefers "0 for an ended goal" instead, this is the
   one line to change.
4. **"Met" on a day `D`** (`D` from the goal's `startDate` to `lastDay`): the goal has an entry dated
   `D` whose value, rounded to two decimals, is at or above `effectiveOn(goal, D, "dailyTarget")`
   rounded to two decimals (F-06 §3.4; falls back to the goal's own stored `dailyTarget` for a goal
   with no revisions, so this is a strict generalisation of F-04's BR-09 comparison, not a new rule
   for an unrevised goal). A day with no entry is not met (BR-12).
5. **Current streak** (BR-12): let `anchor` = `lastDay` if the goal has an entry dated `lastDay`,
   otherwise `lastDay − 1` (BR-12: "ends today, or yesterday if today has no entry yet" — generalised
   to `lastDay` per §2.3/D-16). Starting at `anchor` and walking backward one day at a time, count
   consecutive **met** days (§2.4); stop at the first day that is not met (missing entry or value
   below target) or at the goal's `startDate`, whichever comes first. `currentStreak` is that count.
   If `anchor` itself is not met (there is an entry for `lastDay` but it is below target), the count
   is `0`. If `anchor` is before `startDate` (the goal has not started, or started only today with no
   entry yet), `currentStreak` is `0`.
6. **Longest streak**: the longest run of consecutive **met** days (§2.4) anywhere from `startDate`
   to `lastDay`, inclusive. A single met day is a streak of `1`. A goal with zero met days has
   `longestStreak` `0`. The current streak (§2.5), if non-zero, is one candidate run among the ones
   considered; the longest streak is never smaller than the current streak.
7. A revision (F-06) changes the target used for every day from its `effectiveFrom` onward (BR-11);
   it never changes which days have entries or what those entries' values are. Re-reading streaks
   after a revision re-evaluates "met" for the affected days using the new target, which can turn a
   previously met day into an unmet one (if the new target is higher) or the reverse (if lower), and
   can therefore change both `currentStreak` and `longestStreak`. No entry is changed, deleted or
   revalidated by this (same non-retroactive stance as F-06 §2.4, SRS D-06 pattern) — only which days
   count as "met" is re-derived.

Other decisions:

- Streaks are computed on each request; nothing is stored (same stance as F-04's progress, §3.2 of
  that contract — "computed on each request; nothing extra is stored").
- **Decision D-17 (settled, #77):** F-07 adds its own
  `GET /goals/:id/streaks` endpoint rather than adding `currentStreak`/`longestStreak` fields to
  F-04's already-released `GET /goals/:id/progress` response, so that F-04's contract and response
  shape (already implemented and released as `v1.1-lab7`) are not touched by this feature. If the
  reviewer prefers one combined endpoint, that is a change to F-04's contract, not this one, and
  should be raised there.
- Out of scope (Sprint 2, this contract): a day-by-day streak calendar/history view, streaks across
  more than one goal, Manager visibility of streaks.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /goals/:id/streaks` | Participant (owner) | none | `200 { goalId, currentStreak, longestStreak }` | `400`, `401`, `403`, `404` |

Error body: `{ "error": { "code", "message" } }` (system SDS §6, unchanged).

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (same as F-03/F-04/F-06) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01) | Manager |
| 404 | `NOT_FOUND` | `Goal not found.` (same as F-03/F-04/F-06) | goal does not exist or belongs to another Participant |

No new `ErrorCode` value is needed.

### 3.2 Data

No schema change. Reads `Goal`, `Entry` (F-04) and `GoalRevision` (F-06, through the shared
`effectiveOn` lookup, §3.4 of the F-06 contract) only; writes nothing.

**Layers that need no change, and why:** `Template`, `User` tables; F-01, F-02 routes; `POST /goals`,
`PATCH /goals/:id` (F-06); `POST /goals/:id/entries`, `GET /goals/:id/entries`,
`GET /goals/:id/progress` (F-04) — none of these read or write a streak, and none of F-07's reads
require any change to them.

### 3.3 UI

Added in v1.5 at implementation start (same pattern as F-03/F-04/F-06/F-09).

- **Goal screen, "Streaks" panel** (F-04 §3.3 goal screen, right after the progress card): loads
  `GET /goals/:id/streaks` and shows "Current streak: N days" and "Longest streak: M days" ("1 day"
  when the number is 1, "days" otherwise, including 0).
- After an entry is recorded successfully, the panel loads `GET /goals/:id/streaks` again, so a new
  met day shows without leaving the screen.
- A `401` returns to the login screen. A failed load shows "Could not load streaks." inside the panel
  only (no `role="alert"`), so the rest of the goal screen keeps working (same choice as F-09 §3.3,
  AC-09.20).

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-07.1 | A goal with entries meeting the target on each of the last `k` days up to `lastDay` (inclusive), and a gap or an unmet entry before that, returns `currentStreak` `k`. | FR-11, BR-12 |
| AC-07.2 | A goal with an entry for `lastDay` below target returns `currentStreak` `0`, even if earlier days were met. | BR-12 |
| AC-07.3 | A goal with no entry for `lastDay` but a met entry for `lastDay − 1` (and the day before that also met) counts from `lastDay − 1` backward; `lastDay` itself is not required to be met for a non-zero current streak. | BR-12 |
| AC-07.4 | A goal with no entries at all, or whose `startDate` is after `lastDay`, returns `currentStreak` `0` and `longestStreak` `0`. | BR-12 |
| AC-07.5 | `longestStreak` reports the single longest run of consecutive met days anywhere in the goal's history to date, even when that run is not the current one (an earlier 10-day run beats a current 2-day run). | FR-11 |
| AC-07.6 | `longestStreak` is never smaller than `currentStreak`. | FR-11, BR-12 |
| AC-07.7 | After a revision (F-06) raises the target from its effective date onward, days from that date that were met under the old target but not the new one stop counting as met, and streaks recomputed from `GET /goals/:id/streaks` reflect this; days before the effective date are unaffected. | BR-11 |
| AC-07.8 | After a revision lowers the target from its effective date onward, a previously unmet day on or after that date that now meets the lower target counts as met from then on; days before the effective date are unaffected. | BR-11 |
| AC-07.9 | Anonymous requests receive 401; a Manager receives 403. | NFR-02 |
| AC-07.10 | A goal that does not exist and another Participant's goal return the same 404; a malformed `:id` returns 400 `Invalid goal id.` | BR-08, NFR-05 |
| AC-07.11 | The check order of §2.2 holds: 401 before 400, 403 before 400, 404 before any streak computation. | NFR-02, NFR-05, BR-08 |
| AC-07.12 (v1.5) | `lastDay` uses the end date in effect today (§2.3): a goal whose stored `endDate` is before today but whose revision extends it past today counts met days up to today, not only up to the stored end. | BR-11, BR-12, F-06 §3.2 |
| AC-07.13 (v1.5) | A goal that has already ended (end date in effect before today) still reports the run that ends at its end date as `currentStreak` (D-16), not `0`. | BR-12, D-16 |

**UI (v1.5):**

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-07.14 | The goal screen's Streaks panel shows the current and longest streak from `GET /goals/:id/streaks`, with "day" for 1 and "days" otherwise. | FR-11 |
| AC-07.15 | After an entry is recorded, the panel loads the streaks again and shows the new numbers. | FR-11 |
| AC-07.16 | A failed load (e.g. 500) shows "Could not load streaks." inside the panel with no `role="alert"`, and the rest of the goal screen still works. | FR-11 |
| AC-07.17 | A `401` from the streaks request returns the user to the login screen. | NFR-02 |

## 5. Software test specification (STS)

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-07.1a | API/DB integration | AC-07.1 | goal `G`, target 5, entries meeting target on the last 3 consecutive days up to `lastDay`, a missing day before that | `currentStreak` 3 |
| TEST-07.1b | API/DB integration | AC-07.1 | same `G`; one of those 3 days has an entry below target | `currentStreak` stops at the gap (counts only the unbroken run touching `lastDay`) |
| TEST-07.2 | API/DB integration | AC-07.2 | `G` has an entry for `lastDay` below target, and met entries for the two days before | `currentStreak` 0 |
| TEST-07.3 | API/DB integration | AC-07.3 | `G` has no entry for `lastDay`; met entries for `lastDay − 1` and `lastDay − 2`; no entry for `lastDay − 3` | `currentStreak` 2 |
| TEST-07.4a | API/DB integration | AC-07.4 | `G` has zero entries | `currentStreak` 0, `longestStreak` 0 |
| TEST-07.4b | API/DB integration | AC-07.4 | `G.startDate` is after today (goal not started yet) | `currentStreak` 0, `longestStreak` 0 |
| TEST-07.5 | API/DB integration | AC-07.5 | `G` has a met 5-day run early in its history, then a gap, then a current met 2-day run ending at `lastDay` | `currentStreak` 2, `longestStreak` 5 |
| TEST-07.6 | API/DB integration | AC-07.6 | `G`'s only met run is its current one, 4 days | `currentStreak` 4, `longestStreak` 4 |
| TEST-07.7 | API/DB integration | AC-07.7 | `G` target 5; entries of 6 on days 1 to 5 (all met); revision (F-06) raises target to 7 effective day 3 | days 1 to 2 still met (pre-revision target); days 3 to 5 now unmet (6 < 7); streak numbers reflect the break at day 3 |
| TEST-07.8 | API/DB integration | AC-07.8 | `G` target 5; entries of 4 on days 1 to 5 (all unmet); revision lowers target to 3 effective day 3 | days 1 to 2 still unmet; days 3 to 5 now met; `currentStreak` counts from day 5 back to day 3 only |
| TEST-07.9a | API integration | AC-07.9 | no cookie: `GET /goals/:G/streaks` | 401 `UNAUTHENTICATED` |
| TEST-07.9b | API integration | AC-07.9 | `M` `GET /goals/:G/streaks` | 403 `FORBIDDEN` |
| TEST-07.10a | API/DB integration | AC-07.10 | **control** `P1` `GET /goals/:G1/streaks` (200); `P2` `GET` the same id and a non-existent id | both 404 `NOT_FOUND`, identical |
| TEST-07.10b | API integration | AC-07.10 | `P1` `GET /goals/abc/streaks` | 400 `VALIDATION_ERROR` `Invalid goal id.` |
| TEST-07.11 | API/DB integration | AC-07.11 | **control** `M` `GET /goals/:G1/streaks` (403, owned by `P1`); then `P2` `GET /goals/:G1/streaks` | `M` 403 before any 404 lookup; `P2` 404 (role check happens before ownership for a Manager, ownership before computation for a Participant) |
| TEST-07.12 | API/DB integration | AC-07.12 (v1.5) | stored `endDate` 2026-11-08, revision (`effectiveFrom` 11-05) extends it to 11-30; met entries 11-08 to 11-10, none on 11-07; today 11-10 | `currentStreak` 3, `longestStreak` 3 (with the stored end it would be 1) |
| TEST-07.13 | API/DB integration | AC-07.13 (v1.5) | goal 11-01 to 11-05 (no revision), met entries 11-03 to 11-05, none on 11-02; today 11-10 | `currentStreak` 3, `longestStreak` 3 (D-16) |

All backend tests are in `backend/tests/streaks.test.ts`. Today is 2026-11-10 (Asia/Bangkok); the
default goal runs 2026-11-01 to 2026-11-30 with target 5, so `lastDay` is 2026-11-10. "Day 1 to 5" in
TEST-07.7/07.8 means 2026-11-06 to 2026-11-10 (goal starting 11-06), and the revision rows there and
in TEST-07.12 are inserted directly with the needed `effectiveFrom`, because `PATCH /goals/:id` always
uses today (D-13).

### 5.2 Frontend tests (v1.5)

Component tests (Vitest + React Testing Library) with `fetch` mocked per test, in
`frontend/src/Streaks.test.tsx`. Goal `G1` (template Running), today 2026-11-10.

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-07.14a | UI component | AC-07.14 | `GET /goals/11/streaks` returns `{ goalId: 11, currentStreak: 3, longestStreak: 5 }` | "Current streak: 3 days" and "Longest streak: 5 days" in the Streaks panel |
| TEST-07.14b | UI component | AC-07.14 | returns current 1, longest 1 | "Current streak: 1 day" and "Longest streak: 1 day" |
| TEST-07.15 | UI component | AC-07.15 | first `GET` current 0; record an entry (`POST` 201); second `GET` current 1 | streaks `GET` called twice; "Current streak: 1 day" shown |
| TEST-07.16 | UI component | AC-07.16 | streaks `GET` mocked 500 | "Could not load streaks." inside the panel; no `alert`; progress and the Record entry form still shown |
| TEST-07.17 | UI component | AC-07.17 | streaks `GET` mocked 401 | `onUnauthorized` called |

### 5.3 Regression — must stay unchanged

- All existing `TEST-01.*` to `TEST-05.*` must keep passing unmodified; this feature adds a new,
  read-only endpoint and touches no existing route.
- F-04's BR-09 progress tests (`TEST-04.14*` to `TEST-04.16`) are unaffected: streaks are computed
  independently of the progress percentage, by the same `effectiveOn` lookup F-06 defines, which
  (per F-06 §5.3) is itself required to reproduce Sprint-1 progress numbers exactly for an unrevised
  goal.

## 6. Definition of done

- [x] This contract is committed before any implementation code (#77; tests and code in the F-07 PR).
- [ ] May be implemented and tested on a branch stacked on F-06's feature branch (§ dependency note
      above), but this PR must not merge before F-06's own PR merges to `sprint-1-staging`.
- [ ] Tests TEST-07.* are committed and fail first (red) because the route is missing, with the
      failing output saved under `docs/sprints/sprint-2/evidence/`.
- [ ] Implementation makes all TEST-07.* pass (green), with the passing output saved.
- [ ] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests.
- [ ] No existing test file is edited.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [x] The two proposed decisions (D-16, D-17) are resolved by the reviewer before implementation
      starts (accepted as written by warunwora in the #77 approval, 2026-11-28, before any F-07 test or code).
- [x] UI section (§3.3) is filled in with AC/STS at the start of the implementation phase (v1.5).
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Initial contract, written before any implementation | Sprint 2 planning (`docs/sprints/plan.md` §3) |
| 1.1 | 2026-11-27 | Decision IDs renumbered to avoid collision across PRs (D-13 → D-16, D-14 → D-17); no semantic change | Reviewer-facing cleanup before Deliverable 2 review |
| 1.2 | 2026-11-27 20:52 +07 | Dependency note reworded: "cannot be implemented or tested until F-06 is merged" replaced with "must not be merged before F-06 is merged to `sprint-1-staging`; it may be implemented and tested on a branch stacked on F-06's feature branch (PR base = that branch) because `effectiveOn()` is available there." Clarifies that the constraint is on merge order, not on when implementation/testing may start, once F-06's code exists on a stacked branch. | Author decision, to unblock F-07/F-08 implementation stacked on F-06's feature branch while F-06's own PR is still under review |
| 1.3 | 2026-11-27 21:23 +07 | DoD wording aligned with v1.2 dependency rule; no behaviour change. §6 item 2 ("Not implementable until F-06 is merged; the Issue ... not opened for implementation until then") was left stale after the v1.2 reword; replaced with "May be implemented and tested on a branch stacked on F-06's feature branch ..., but this PR must not merge before F-06's own PR merges to sprint-1-staging." | Found while checking F-08's PR #85 for the same stale wording; author decision |
| 1.4 | 2026-11-28 02:50 +07 | §2 step 3's `lastDay` definition corrected to read the end date *in effect* (F-06 §3.2), not the stored `Goal.endDate` column; a note for the implementer only, since F-07 has no code yet. No AC/STS change (no code to test). | Review finding by warunwora on F-06 PR #76; no scope creep |
| 1.5 | 2026-11-28 | Implementation start, no test or code yet. Owner and reviewer set. D-16/D-17 marked settled (#77 approval). §3.3 UI filled in; AC-07.12/07.13 (end date in effect, ended goal) and UI AC-07.14 to AC-07.17 added with TEST-07.12, TEST-07.13 and TEST-07.14a to TEST-07.17; backend test file and dates named in §5. | Implementation start; F-06 end-date finding; same panel-error choice as F-09 (#86 review) |
