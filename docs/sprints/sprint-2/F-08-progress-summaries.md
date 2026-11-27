# F-08 — Progress Summaries (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-08 |
| Sprint | 2 |
| Linked requirements | FR-12, BR-11; SRS D-18, D-19 (this contract; accepted as written by warunwora in the #77 approval, 2026-11-28) |
| Depends on | F-01 (`requireRole`), F-04 (entries; `findOwnGoal`, BR-09's `lastDay` boundary), **F-06** (goal revisions; §3.4 "target in effect per day" resolution; merged in #84) |
| Needed by | — |
| Owner | asamapornch (implementation, PR #85) |
| Reviewer | warunwora (contract PR #77 and implementation PR #85) |
| Status | **Implemented and merged: AC-08.1 to AC-08.16 with TEST-08.* green, including the AC-08.16 end-date-in-effect fix (`7d6caf0`). PR #85 merged to `sprint-1-staging` after F-06 (`7ade62c`, 2026-11-28).** |

**Dependency note:** like F-07, this feature must not be merged before F-06 is merged to
`sprint-1-staging`; it may be implemented and tested on a branch stacked on F-06's feature branch
(PR base = that branch) because `effectiveOn()` is available there, since "days met" within a period
needs the target in effect on each of that period's days (F-06 §3.4). `docs/sprints/plan.md` §3 states
this dependency explicitly. This contract can be written and reviewed independently of F-06's PR, but
its Definition of Done (§6) cannot be checked off until F-06 ships.

## 1. Purpose

Let a Participant see, for one of their own goals, how the current week and the current month are
going at a glance: how many days have a recorded value, how many of those met the target, the total
value recorded, and the average per recorded day — a coarser view than the day-by-day history F-04
already shows.

## 2. Behaviour

1. **Summary** (`GET /goals/:id/summary`, Participant, goal owner) returns the current week's and
   current month's figures for that goal in one response.
2. Checks run in this order (same pattern as F-03/F-04/F-06/F-07), and the first failing step answers:
   1. no session: **401**;
   2. wrong role (a Manager): **403**;
   3. id format only: **400** `Invalid goal id.` (malformed `:id`; there is no request body);
   4. goal existence and ownership: **404** `Goal not found.` (identical response for a goal that
      does not exist and a goal of another Participant, BR-08, same as F-03/F-04/F-06/F-07).
3. Let `lastDay` be the earlier of today (Asia/Bangkok) and the goal's **end date in effect today**
   (F-06 §3.2, `effectiveOn(goal, revisions, today, "endDate")` — not the stored `Goal.endDate`
   column; **review finding by warunwora on F-06 PR #76, fixed here in v1.5**: this step previously
   read the stored column directly, same mistake as the one corrected in F-06 v1.4's `GET
   /goals/:id/progress`). The same boundary F-04's BR-09 and F-07 use.
4. **Decision D-18 (settled, #77):** the **week** window is the Monday-to-Sunday
   ISO calendar week containing `lastDay`; the **month** window is the calendar month (first to last
   day) containing `lastDay`. Neither the SRS nor `docs/sprints/plan.md` specifies a week/month
   convention; ISO weeks and calendar months are the simplest, least ambiguous choice and need no
   extra configuration (no "which day starts the week" setting). Each window is clipped at the low
   end to the goal's `startDate` (a day before the goal started is never counted, even if the
   calendar week or month contains it) and at the high end to `lastDay` (a day after `lastDay`,
   including a day after the end date in effect today, step 3, is never counted). A goal whose `startDate` is after
   the window's natural end has an empty window for that period (every figure `0`).
5. For each window (week, month), over the clipped date range `[windowStart, windowEnd]`:
   - `daysRecorded` = the number of the goal's entries dated inside the window;
   - `daysMet` = the number of those entries whose value, rounded to two decimals, is at or above
     `effectiveOn(goal, date, "dailyTarget")` for that entry's own date (F-06 §3.4; same per-day
     lookup F-07 uses, so an unrevised goal reproduces exactly what a single scalar comparison against
     its stored `dailyTarget` would give — no change in behaviour for a goal with zero revisions);
   - `total` = the sum of those entries' values (rounded to two decimals);
   - `average` = `total ÷ daysRecorded`, rounded half up to two decimals (**Decision D-19 (settled,
     #77)**: generalises SRS D-10's "round half up to two decimals" convention,
     written there for the progress percentage, to this plain value average); `0` when `daysRecorded`
     is `0`.
6. A revision (F-06) changes which days count as "met" within a window from its `effectiveFrom`
   onward (BR-11), exactly as it does for F-07's streaks (§2.7 of that contract); it never changes
   `daysRecorded`, `total` or `average`, which depend only on recorded entries, not on the target.
7. The response always reports **the current week and month as of `lastDay`**, not an arbitrary past
   or future period; this feature does not let a Participant browse other weeks or months (out of
   scope, §2 below) — `docs/sprints/plan.md` §3's "done when" row only asks for "weekly and monthly
   figures ... shown in the goal screen," which this satisfies without inventing a browsing UI nobody
   asked for.

Other decisions:

- Summaries are computed on each request; nothing is stored (same stance as F-04 progress and F-07
  streaks).
- Out of scope (Sprint 2, this contract): browsing a week/month other than the current one, a summary
  across more than one goal, Manager visibility of summaries.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /goals/:id/summary` | Participant (owner) | none | `200 { goalId, week: { start, end, daysRecorded, daysMet, total, average }, month: { start, end, daysRecorded, daysMet, total, average } }` | `400`, `401`, `403`, `404` |

`week.start`/`week.end` and `month.start`/`month.end` are the **clipped** window boundaries (§2.4),
as `YYYY-MM-DD` strings, so a reader can check the figures the same way F-04's progress response
exposes `today` (F-04 §3.1).

Error body: `{ "error": { "code", "message" } }` (system SDS §6, unchanged).

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (same as F-03/F-04/F-06/F-07) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01) | Manager |
| 404 | `NOT_FOUND` | `Goal not found.` (same as F-03/F-04/F-06/F-07) | goal does not exist or belongs to another Participant |

No new `ErrorCode` value is needed.

### 3.2 Data

No schema change. Reads `Goal`, `Entry` (F-04) and, through F-06's `effectiveOn` lookup, `GoalRevision`
(F-06); writes nothing.

**Layers that need no change, and why:** same list as F-07 §3.2 — `Template`, `User` tables; F-01,
F-02 routes; `POST /goals`, `PATCH /goals/:id` (F-06); `POST /goals/:id/entries`,
`GET /goals/:id/entries`, `GET /goals/:id/progress` (F-04); and F-07's `GET /goals/:id/streaks` is
also untouched — the two features read the same underlying data independently and neither calls the
other.

### 3.3 UI

Added in v1.4 (UI implementation start, as F-03 v1.2/F-04 v1.2 did; F-07's own panel is out of scope
here). On the goal screen (`frontend/src/GoalDetail.tsx`, F-04 §3.3), a "This week / this month"
panel fetched from `GET /goals/:id/summary` alongside the existing progress panel, shows each
window's date range (`start` to `end`) and its `daysRecorded`, `daysMet`, `total` and `average`. A
window with `daysRecorded` 0 shows an explicit empty message ("No entries recorded this
week."/"...this month.") instead of zero-styled figures, so a reader is not left wondering whether
zero is a real result or a loading/error artifact. A loading message is shown while the summary is
being fetched; an error fetching it shows an error message (`role="alert"`), not a stuck loading
state; a 401 returns to the login screen (AC-04.22 pattern). After a goal revision (F-06 §3.3)
succeeds, the panel refetches so `daysMet` reflects the new target without a page reload. The panel
is reachable only from the goal screen, which only the owning Participant can open (AC-03.16,
AC-04.22) — this feature's UI adds no separate visibility check.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-08.1 | For a goal with entries inside the current ISO week, `week.daysRecorded`, `week.daysMet`, `week.total` and `week.average` are computed over exactly the entries dated within that week, clipped to the goal's `startDate` and `lastDay`; entries outside the week are excluded. | FR-12 |
| AC-08.2 | For the same goal, `month.*` is computed the same way over the calendar month containing `lastDay`. | FR-12 |
| AC-08.3 | A goal whose `startDate` falls inside the current week/month has that window clipped to start at `startDate`, not the calendar week/month's natural start. | FR-12, D-18 (proposed) |
| AC-08.4 | A goal with no entries in a window returns `daysRecorded` 0, `daysMet` 0, `total` 0, `average` 0 for that window. | FR-12 |
| AC-08.5 | `average` equals `total ÷ daysRecorded` rounded half up to two decimals (2 of 3 recorded days, total 10 → average 3.33; total 11 → average 3.67). | FR-12, D-19 |
| AC-08.6 | After a revision (F-06) changes the target effective partway through the current week or month, `daysMet` for that window reflects the new target from the effective date onward and the old target before it; `daysRecorded`, `total` and `average` are unaffected by the revision. | BR-11 |
| AC-08.7 | Anonymous requests receive 401; a Manager receives 403. | NFR-02 |
| AC-08.8 | A goal that does not exist and another Participant's goal return the same 404; a malformed `:id` returns 400 `Invalid goal id.` | BR-08, NFR-05 |
| AC-08.9 | The check order of §2.2 holds: 401 before 400, 403 before 400, 404 before any summary computation. | NFR-02, NFR-05, BR-08 |
| AC-08.10 (UI) | The goal screen shows a "This week / this month" panel with `daysRecorded`, `daysMet`, `total` and `average` for both windows, fetched from `GET /goals/:id/summary`; a loading message is shown while it is fetched. | FR-12, §3.3 |
| AC-08.11 (UI) | Each window shows its date range (`start` to `end`) alongside its figures. | FR-12 |
| AC-08.12 (UI) | A window with `daysRecorded` 0 shows an explicit empty-state message instead of zero-styled figures. | FR-12 |
| AC-08.13 (UI) | An error fetching the summary shows an error message (`role="alert"`), not a stuck loading state; a 401 returns to the login screen. | NFR-02, NFR-05 |
| AC-08.14 (UI) | The panel is only reachable from the goal screen, which only the owning Participant can open (AC-03.16, AC-04.22); this feature's UI adds no separate visibility check. | BR-08 |
| AC-08.15 (UI) | After a goal revision (F-06 §3.3) succeeds, the panel refetches and `daysMet` reflects the new target without a page reload. | BR-11 |
| AC-08.16 | After an `endDate` revision extends a goal's end, the week/month windows' natural end (and hence `windowEnd`, `daysRecorded`, `daysMet`, `total`, `average`) are computed against the end date in effect today, not the stale stored end — a day added by the extension is counted once an entry exists for it, exactly as F-06's own progress fix (AC-06.23) does for `GET /goals/:id/progress`. | BR-11, §2 step 3 |

## 5. Software test specification (STS) — planned, not yet written as executable tests

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-08.1a | API/DB integration | AC-08.1 | goal `G`, target 5; entries 6, 4 and 5 on three days inside the current ISO week; one entry the week before | `week.daysRecorded` 3, `week.daysMet` 2, `week.total` 15, `week.average` 5; the earlier entry excluded |
| TEST-08.1b | API/DB integration | AC-08.1 | same `G`; an entry dated after `lastDay` is impossible to create (F-04 BR-03 rejects future dates) — test instead asserts the window's `end` equals `lastDay` when `lastDay` is before the week's natural Sunday | `week.end` equals `lastDay`, not the following Sunday |
| TEST-08.2 | API/DB integration | AC-08.2 | same `G`; entries spread across the current calendar month | `month.daysRecorded`/`daysMet`/`total`/`average` computed over the whole month to `lastDay`, matching a hand-computed figure |
| TEST-08.3 | API/DB integration | AC-08.3 | `G.startDate` is three days into the current ISO week | `week.start` equals `G.startDate`, not the week's Monday; an entry two days before `G.startDate` (if one could exist) is never counted — asserted by confirming `week.start` |
| TEST-08.4 | API/DB integration | AC-08.4 | goal `G2` with zero entries | `week` and `month` both `{ daysRecorded: 0, daysMet: 0, total: 0, average: 0 }` |
| TEST-08.5a | API/DB integration | AC-08.5 | week entries 3, 3, 4 (3 days, total 10) | `average` 3.33 |
| TEST-08.5b | API/DB integration | AC-08.5 | week entries 3, 4, 4 (3 days, total 11) | `average` 3.67 (rounded up) |
| TEST-08.6 | API/DB integration | AC-08.6 | `G` target 5; entries 6 on days 1 to 5 of the current month (all met); revision raises target to 7 effective day 3 | `month.daysMet` counts only days 1 and 2 as met; `month.daysRecorded` and `month.total` unchanged (5 and 30) |
| TEST-08.7a | API integration | AC-08.7 | no cookie: `GET /goals/:G/summary` | 401 `UNAUTHENTICATED` |
| TEST-08.7b | API integration | AC-08.7 | `M` `GET /goals/:G/summary` | 403 `FORBIDDEN` |
| TEST-08.8a | API/DB integration | AC-08.8 | **control** `P1` `GET /goals/:G1/summary` (200); `P2` `GET` the same id and a non-existent id | both 404 `NOT_FOUND`, identical |
| TEST-08.8b | API integration | AC-08.8 | `P1` `GET /goals/abc/summary` | 400 `VALIDATION_ERROR` `Invalid goal id.` |
| TEST-08.9 | API/DB integration | AC-08.9 | **control** `M` `GET /goals/:G1/summary` (403, owned by `P1`); then `P2` `GET /goals/:G1/summary` | `M` 403; `P2` 404 |
| TEST-08.16 | API/DB integration | AC-08.16 | `G` stored end day 10, revised/extended to day 20; an entry dated day 15 (inserted directly, within the extended window); `GET /goals/:id/summary` with "today" after day 20 | the window containing day 15 reports `daysRecorded` 1 for that entry; `window.end` reflects day 20, not the stale stored day 10 |

### 5.2 Frontend tests

File: `frontend/src/GoalDetail.test.tsx`.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-08.10a | AC-08.10 | Goal screen rendered; `GET /goals/11/summary` left pending, then resolved with week/month figures | a loading message is shown first; then the panel shows both windows' `daysRecorded`/`daysMet`/`total`/`average` |
| TEST-08.10b | AC-08.10 | `GET /goals/11/summary` rejected | an error message (`role="alert"`) is shown, not an endless loading state (also covers AC-08.13) |
| TEST-08.11 | AC-08.11 | `GET /goals/11/summary` resolves with `week.start "2026-11-09"`, `week.end "2026-11-12"` | the week panel shows "2026-11-09 to 2026-11-12" (and similarly for month) |
| TEST-08.12 | AC-08.12 | `GET /goals/11/summary` resolves with `week.daysRecorded` 0 | the week panel shows "No entries recorded this week." instead of `0`/`0`/`0`/`0` |
| TEST-08.13 | AC-08.13 | Rendered through `App`; `GET /goals/11/summary` mocked to 401 | the login form is shown |
| TEST-08.14 | AC-08.14 | `Goals` rendered as a Participant with one own goal, then (fresh render) as a Manager | Participant: opening the goal shows the summary panel; Manager: no goal screen exists to open (AC-03.16), so the panel is unreachable by construction |
| TEST-08.15 | AC-08.15 | Goal screen rendered; a revision submitted via the "Revise goal" control (F-06 §3.3) succeeds | `GET /goals/11/summary` is called a second time after the revision resolves, and the panel shows the refreshed figures |

### 5.3 Regression — must stay unchanged

- All existing `TEST-01.*` to `TEST-05.*` must keep passing unmodified; this feature adds a new,
  read-only endpoint and touches no existing route.
- F-04's BR-09 progress tests and F-07's streak tests are unaffected: summaries are computed
  independently, reading the same entries and the same F-06 `effectiveOn` lookup without writing
  anything or sharing mutable state with either.

## 6. Definition of done

- [x] This contract is committed before any implementation code (`25be22e`, 2026-11-27 02:22, before the first F-08 test commit `8b45da2`).
- [x] May be implemented and tested on a branch stacked on F-06's feature branch (§ dependency note
      above), but this PR must not merge before F-06's own PR merges to `sprint-1-staging`. (#84
      merged as `418e2af`, then #85 as `7ade62c`.)
- [x] Tests TEST-08.* are committed and fail first (red) because the route is missing, with the
      failing output saved under `docs/sprints/sprint-2/evidence/` (`8b45da2`, 13 failed,
      `F-08-red-output.txt`).
- [x] Implementation makes all TEST-08.* pass (green), with the passing output saved (`bab6915`, `F-08-green-output.txt`).
- [x] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests (283 passed on `sprint-1-staging` `d1eddad`).
- [x] No existing test is changed. The backend tests are a new file (`goalSummaries.test.ts`); the UI tests TEST-08.10 to TEST-08.15 were added to the existing `frontend/src/GoalDetail.test.tsx` as new cases only (150 lines added, 0 removed in `ee82bcc`), with no existing expected result edited.
- [x] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked (PR #85, Refs #81,
      approved by warunwora).
- [ ] The two proposed decisions (D-18, D-19) are resolved by the reviewer before implementation
      starts. **Not met as written:** warunwora accepted both as written in the #77 approval on
      2026-11-28, after F-08 was implemented on #85; the implementation already followed them, so no
      code changed.
- [x] UI section (§3.3) is filled in with AC/STS at the start of the implementation phase (v1.4).
- [x] TEST-08.10 to TEST-08.15 are committed red before the UI code, then green (`ee82bcc` 7 failed → `cb98b7b`; `F-08-ui-red-output.txt`, `F-08-ui-green-output.txt`).
- [x] **New in v1.5 (review finding, warunwora on F-06 PR #76):** TEST-08.16 is committed red before
      its implementation and green after, with output saved to
      `docs/sprints/sprint-2/evidence/F-08-review-fix-red-output.txt` /
      `F-08-review-fix-green-output.txt`.
- [x] Failed or skipped tests, if any, are listed in the evidence report: none failed or skipped in the green runs.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Initial contract, written before any implementation | Sprint 2 planning (`docs/sprints/plan.md` §3) |
| 1.1 | 2026-11-27 | Decision IDs renumbered to avoid collision across PRs (D-13 → D-18, D-14 → D-19); no semantic change | Reviewer-facing cleanup before Deliverable 2 review |
| 1.2 | 2026-11-27 20:52 +07 | Dependency note reworded: "cannot be implemented or tested until F-06 is merged" replaced with "must not be merged before F-06 is merged to `sprint-1-staging`; it may be implemented and tested on a branch stacked on F-06's feature branch (PR base = that branch) because `effectiveOn()` is available there." Clarifies that the constraint is on merge order, not on when implementation/testing may start, once F-06's code exists on a stacked branch. | Author decision, to unblock F-07/F-08 implementation stacked on F-06's feature branch while F-06's own PR is still under review |
| 1.3 | 2026-11-27 21:23 +07 | DoD wording aligned with v1.2 dependency rule; no behaviour change. §6 item 2 ("Not implementable until F-06 is merged; the Issue ... not opened for implementation until then") was left stale after the v1.2 reword; replaced with "May be implemented and tested on a branch stacked on F-06's feature branch ..., but this PR must not merge before F-06's own PR merges to sprint-1-staging." | Flagged in PR #85's body, fixed here; author decision |
| 1.4 | 2026-11-27 21:58 +07 | UI AC/STS added at implementation start, as F-03/F-04 did; no backend behaviour change. §3.3 filled in; AC-08.10 to AC-08.15 and TEST-08.10 to TEST-08.15 added (§5.2). | UI implementation start, following F-03 v1.2/F-04 v1.2 |
| 1.5 | 2026-11-28 03:05 +07 | §2 step 3's `lastDay` corrected to read the end date *in effect* (F-06 §3.2), not the stored `Goal.endDate` column. AC-08.16 and TEST-08.16 added. | Review finding by warunwora on F-06 PR #76; no scope creep |
| 1.6 | 2026-11-28 | Status line updated: F-08 is implemented on PR #85 (was "no code yet"). §2 step 4 says "the end date in effect today" instead of "the goal's `endDate`", so it does not read as the stored column. No behaviour, AC or test change. | Review by warunwora on #77 |
| 1.7 | 2026-11-28 | Status: PR #85 merged. D-18/D-19 marked settled (accepted as written by warunwora in the #77 approval; note: after F-08 was implemented, not before). Owner/Reviewer and the DoD are left to the owner. | Combined Sprint 2/3 docs update after the merges |
| 1.8 | 2026-11-28 | Owner asamapornch and Reviewer warunwora filled in. Definition of done ticked with evidence (commits, outputs, PR #85); the "no existing test file is edited" item reworded, because TEST-08.10 to TEST-08.15 were added to `GoalDetail.test.tsx` as new cases only; the D-18/D-19 item stays unticked with a note (accepted after implementation). No behaviour, AC or test change. | Owner check on #97 |
