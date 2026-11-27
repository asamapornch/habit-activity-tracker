# F-06 — Goal Revisions (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-06 |
| Sprint | 2 |
| Linked requirements | FR-10, BR-10, BR-11; SRS D-13, D-14, D-15, D-24 (this contract; settled by warunwora on PR #76, 2026-11-28) |
| Depends on | F-01 (`requireRole`), F-02 (templates; current range), F-03 (goals; BR-04 overlap, BR-05 range check), F-04 (entries; BR-09 progress, `findOwnGoal`) |
| Needed by | F-07 (streaks), F-08 (progress summaries) — both read "the target in effect per day" defined here |
| Owner | asamapornch (implementation, PR #84) |
| Reviewer | warunwora (contract PR #76 and implementation PR #84) |
| Status | **Implemented and merged: AC-06.1 to AC-06.25 green, PR #84 merged to `sprint-1-staging` (`418e2af`, 2026-11-28). D-13, D-14, D-15 and D-24 settled (v1.5).** |

## 1. Purpose

Let a Participant change the daily target and/or end date of one of their own goals without losing
or rewriting the history that already exists. Sprint 1 treats a goal's `dailyTarget` and `endDate` as
fixed at creation (SRS D-03: "Goal changes are deferred to Sprint 2"). This feature adds a **revision
history**: each revision takes effect from a date forward, and every day before that date keeps
reading the value that was in effect on that day. F-07 (streaks) and F-08 (summaries) are both built
on the same "target in effect per day" lookup this feature defines, so they depend on it (`docs/sprints/plan.md`
§3: *"F-07 and F-08 need F-06's target-in-effect rule"*).

## 2. Behaviour

1. **Revise** (`PATCH /goals/:id`, Participant, goal owner) changes `dailyTarget` and/or `endDate` on
   one of the caller's own goals, effective from today (Asia/Bangkok). The goal's `templateId` and
   `startDate` can never be changed by a revision (BR-10).
2. Checks run in this order (same pattern as F-03 §2.4 and F-04 §2.4), and the first failing step
   answers:
   1. no session: **401**;
   2. wrong role (a Manager): **403**, before the body or id is looked at;
   3. body shape and id format only: **400** `Invalid goal id.` / `Invalid goal revision fields.`
      (malformed id; body not an object; unknown keys; neither `dailyTarget` nor `endDate` given;
      wrongly typed or out-of-shape values);
   4. goal existence and ownership: **404** `Goal not found.` — identical response for a goal that
      does not exist and a goal of another Participant (BR-08, same as F-03/F-04);
   5. the goal has not already ended — its **end date in effect today** (§3.2) is not before today
      (**Decision D-24**, see below): **409** `CONFLICT` `This goal has
      already ended and cannot be revised.`; a goal whose effective end date is today itself has not
      yet ended and may still be revised;
   6. BR-10, the new `dailyTarget` (when given) checked against the template's **current** range
      (SRS D-06, same source of truth as F-03's BR-05 and F-04's BR-02): **400**
      `Daily target must be within the template range.` (the exact F-03 message — same rule, same
      wording, reused rather than restated);
   7. BR-10, the new `endDate` (when given) checked in this order against three floors: before today
      (**400** `New end date must not be before today.`), before the goal's `startDate` (**400**
      `New end date must not be before the goal's start date.`), before the goal's latest recorded
      entry date, if it has any entries (**400** `New end date must not be before the goal's latest
      entry date.`);
   8. BR-04, re-checked with the revised `endDate` against the Participant's **other** goals on the
      same template (the goal being revised is excluded from its own overlap check), compared
      against each other goal's **end date in effect today** (§3.2), not its stored `endDate`: **409**
      `CONFLICT` `You already have a goal for this template that overlaps these dates.` (the exact
      F-03 message, reused).

**Decision D-24 (settled — review finding by warunwora on #76, accepted by him as written on 2026-11-28):** revising an
already-ended goal was previously undefined — nothing in v1.0–v1.3 rejected it, and because a
revision's `effectiveFrom` is always today (D-13) while an ended goal's window never reaches today
again, such a revision would be stored but have no visible effect on anything (progress, entries)
that only ever looks at days up to the goal's own end — a confusing "succeeds but does nothing"
state. Rule: reject with 409 before any field-specific check, using the same `CONFLICT` code
already used for BR-04 (no new `ErrorCode` value). "Already ended" means the goal's end date in
effect today (§3.2) is strictly before today; a goal ending today is not yet ended. If the reviewer
prefers a different status/message, or prefers to allow revising `dailyTarget` alone on an ended goal
while only blocking `endDate` changes, that is a one-line change to this step, not a redesign.
3. A revision that only gives `dailyTarget` keeps the goal's current `endDate` unchanged (and vice
   versa); whichever value is *not* given keeps its currently effective value, not the Sprint-1
   original. Example: a goal created with target 5, then revised to target 8 on day 10, then revised
   again on day 20 giving only a new `endDate`, keeps target 8 (not the original 5) from day 20
   onward.
4. Every revision is stored as its own row (§3.2); none overwrite or delete an earlier one. A revised
   goal keeps every entry already recorded (F-04); no entry is revalidated, changed or removed by a
   revision (same non-retroactive principle as SRS D-06, D-12).
5. **Target (or end date) in effect on day `D`:** the latest revision of the goal whose
   `effectiveFrom <= D`, if any exists; otherwise the goal's own stored `dailyTarget` / `endDate` from
   creation. "Latest" orders by `effectiveFrom` descending, then by `id` descending for revisions that
   share the same `effectiveFrom` (**Decision D-14**, §2.7). This lookup is what F-04's
   BR-09, F-07's BR-12 and F-08 all call per day; see §3.4.
6. `GET /goals/:id` and `GET /goals` (F-03) start returning the **currently effective** `dailyTarget`
   and `endDate` (today's lookup from §2.5), not necessarily the values stored on the `Goal` row
   itself. This is the only change to F-03's read endpoints; their request shape, roles, ownership
   rules and error behaviour are unchanged.
7. **Effective date of a revision.** A revision always takes effect from **today** (Asia/Bangkok) —
   the caller cannot set a past or future `effectiveFrom` (**Decision D-13**:
   simplest reading consistent with BR-10's "new end date must not be before today," which only makes
   sense if the revision itself is immediate; a back-dated or scheduled revision is not requested
   anywhere in the SRS or the Sprint 2 "done when" row in `docs/sprints/plan.md` §3). If two revisions
   are made on the same goal on the same calendar day, the later one (higher `id`) is in effect for
   that day and afterward until superseded (**Decision D-14**).

Field rules (request body of `PATCH /goals/:id`), checked in step 3 unless stated:

- The body must be a JSON object (not an array or `null`) with **at least one, and only**, keys from
  `{dailyTarget, endDate}`. An empty object, an unknown key, or both keys absent return 400. This is a
  new shape rule (a non-empty subset of two optional keys), not the existing `hasExactKeys` helper
  used by F-03/F-04 (which requires an exact fixed key set) — the implementation needs a new, small
  validation helper; no existing validation helper changes.
- `dailyTarget` (when given): a finite JSON number with at most two decimal places (SRS A-05), same
  rule as F-03's `dailyTarget`; a numeric string is rejected.
- `endDate` (when given): a string in exactly `YYYY-MM-DD` form that is a real calendar date, same
  rule as F-03/F-04 dates.
- BR-10's range, floor and overlap checks (steps 5 to 7) run only on whichever field was given; a
  revision that gives only `endDate` skips the `dailyTarget` range check entirely, and vice versa.

Other decisions:

- A revision cannot be undone or deleted in Sprint 2 (not in the SRS); a mistaken revision needs a
  new, corrective revision. This mirrors F-04's "no edit or delete" stance on entries (§2, Out of
  scope).
- `GET /goals/:id/revisions` (history of revisions) is **not** requested by FR-10 and is out of scope
  for this contract; only the currently effective values are exposed through F-03's existing
  endpoints (§2.6). A later feature could add a revision-history endpoint if a reviewer asks for one.
- The "latest entry date" floor in §2.6 reads from the `Entry` table (F-04); a goal with no entries
  has no such floor, and only the today/start floors apply.
- Dates are exchanged as `YYYY-MM-DD` strings, as in F-03/F-04; `dailyTarget` as a JSON number.

Out of scope (Sprint 2, this contract): reading revision history, revising `templateId` or
`startDate`, deleting a goal, Manager visibility of revisions.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `PATCH /goals/:id` | Participant (owner) | `{ dailyTarget? }` and/or `{ endDate? }` | `200 { id, userId, templateId, dailyTarget, startDate, endDate }` (currently effective values) | `400`, `401`, `403`, `404`, `409` |

`GET /goals` and `GET /goals/:id` (F-03, unchanged request/response shape) now return the currently
effective `dailyTarget`/`endDate` per §2.6, instead of always the Sprint-1 stored value.

Error body: `{ "error": { "code", "message" } }` (system SDS §6, unchanged).

| Status | Code | Message | When |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `Invalid goal id.` | malformed `:id` (same as F-03/F-04) |
| 400 | `VALIDATION_ERROR` | `Invalid goal revision fields.` | body shape (step 3) |
| 401 | `UNAUTHENTICATED` | `Authentication required.` (F-01) | no valid session |
| 403 | `FORBIDDEN` | `You do not have permission to perform this action.` (F-01) | Manager |
| 404 | `NOT_FOUND` | `Goal not found.` (same as F-03/F-04) | goal does not exist or belongs to another Participant |
| 409 | `CONFLICT` | `This goal has already ended and cannot be revised.` | D-24 (step 5) — the goal's end date in effect today is before today |
| 400 | `VALIDATION_ERROR` | `Daily target must be within the template range.` | BR-10 target (step 6; exact F-03 BR-05 message, reused) |
| 400 | `VALIDATION_ERROR` | `New end date must not be before today.` | BR-10 end-date floor 1 (step 7) |
| 400 | `VALIDATION_ERROR` | `New end date must not be before the goal's start date.` | BR-10 end-date floor 2 (step 7) |
| 400 | `VALIDATION_ERROR` | `New end date must not be before the goal's latest entry date.` | BR-10 end-date floor 3 (step 7) |
| 409 | `CONFLICT` | `You already have a goal for this template that overlaps these dates.` | BR-04 re-check (step 8; exact F-03 message, reused; now compared against other goals' end date in effect, §3.2) |

No new `ErrorCode` value is needed; `VALIDATION_ERROR`, `CONFLICT`, `NOT_FOUND` already exist in
`backend/src/lib/errors.ts`.

### 3.2 Data (planned migration — described in prose, no migration file in this PR)

New table `GoalRevision`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | serial PK | |
| `goalId` | int, FK → `Goal.id` | no cascade behaviour relied on (same stance as F-03/F-04) |
| `dailyTarget` | float | the goal's daily target from `effectiveFrom` onward |
| `endDate` | date | the goal's end date from `effectiveFrom` onward |
| `effectiveFrom` | date | always today (Asia/Bangkok) at creation time, §2.7 |
| `createdAt` | timestamp, default now | audit only; also the tie-break order together with `id` (§2.5, D-14) |

The existing `Goal` table (`id`, `userId`, `templateId`, `dailyTarget`, `startDate`, `endDate`) is
**not altered** — no new column, no changed column, no default, no backfill. A goal's own
`dailyTarget`/`endDate` columns keep meaning "the value in effect from `startDate` until the first
revision, if any" — exactly their Sprint-1 meaning, so every goal that has never been revised behaves
identically to Sprint 1 with zero migration risk to existing rows (same non-retroactive pattern as
F-02 v1.6's nullable `backdateDays`, SRS D-12).

**Review finding (warunwora, PR #76, v1.4): §3.2 was wrong about `endDate`.** The paragraph below
previously claimed `POST /goals/:id/entries`, the BR-04 overlap check and `GET /goals/:id/progress`
"need no change" because they read the stored `Goal.endDate`. That is true for `dailyTarget` (no
caller outside this feature reads it before F-06 ships) but **not** true for `endDate`: those three
places read `goal.endDate` directly today, and once a revision can change `endDate`, that stored
column is no longer the goal's current end date — `GET /goals/:id` already shows the revised value
(§2.6) while these other places would silently keep using the stale stored one. Corrected below.

**"End date in effect" on day `D`:** exactly `effectiveOn(goal, revisions, D, "endDate")` (§2.5/§3.4)
— the same function and the same tie-break rule already defined for `dailyTarget`, just read for the
`endDate` field instead. Every place that needs "the goal's end date" must use this, not
`goal.endDate` (the stored column) directly, **except** where the contract says otherwise below.

**Layers that need no change, and why:**

- `Template`, `User` tables: untouched. A revision never reads or writes a template or user row.
- F-01 (`requireAuth`/`requireRole`), F-02 (`templates.ts`): no behaviour depends on revisions.
- `POST /goals` (goal creation, F-03) **own new row**: unchanged for the goal being created — a
  newly created goal has no revisions, so §2.5's lookup falls through to its own stored values
  exactly as today. (Its BR-04 overlap check against *other* goals does change — see below.)
- `GET /goals/:id/entries` (F-04 history): unchanged; history lists stored entries, not targets or
  end dates.
- The `GoalRevision` row itself, and the "latest entry date" BR-10 floor (§2.6): read `Entry` rows
  directly, not `goal.endDate`; unaffected either way.

**Layers that change (planned here, not yet implemented in this PR — corrected scope):**

- `POST /goals/:id/entries` (F-04 BR-03, `backend/src/routes/entries.ts`): the goal-date-range check
  (`date < goal.startDate || date > goal.endDate`) must compare against the **end date in effect on
  the entry's own posting date** (i.e. today, since an entry can only be posted for today or the
  past, never the future — BR-03's own future-date check already excludes dates after today, so "in
  effect on the entry's date" and "in effect today" agree here), not the stored `goal.endDate`. An
  entry dated between the old and a newly-extended end date must be accepted; an entry dated after
  the (possibly revised) effective end is rejected exactly as before, just against the right value.
- BR-04 overlap check, **both** call sites — `POST /goals` (creation, checking the new goal against
  existing ones) and `PATCH /goals/:id`'s own re-check (§2 step 7, checking the revised goal against
  the Participant's *other* goals on the same template): both currently compare against the other
  goal(s)' stored `startDate`/`endDate` columns. They must compare against each other goal's **end
  date in effect today**, so a goal whose end date was extended by its own earlier revision is not
  missed by a later overlap check that only looked at its stale stored end date. (`startDate` is
  never revised — §2, "cannot change the template or the start date" — so only the `endDate` side of
  every overlap comparison needs this; `startDate` comparisons are unaffected.)
- `GET /goals/:id/progress` (F-04 BR-09, `backend/src/routes/entries.ts`): `lastDay` (`today` capped
  at the goal's end) must be computed from the end date in effect **today**, not the stored
  `goal.endDate`. This also changes `daysElapsed`'s cap and which entries fall inside the progress
  window. (The `dailyTarget` side of this route already changed in v1.0/v1.2 of this contract —
  unaffected by this finding, which is about `endDate` only.)
- `GET /goals/:id/summary` (F-08, once it exists): same `lastDay` correction applies there; F-08's
  own contract is updated separately (`docs/sprints/sprint-2/F-08-progress-summaries.md`).
- F-07 (streaks): its own `lastDay` definition has the same dependency; noted in that contract for
  its implementer, no code changes from this PR.

This contract records the corrected plan; it is implemented and tested under F-06's own Definition of
Done (§6), not retroactively inside F-04's existing, already-released contract.

### 3.4 Shared resolution logic (used by F-06, F-07, F-08)

A single function, informally `effectiveOn(goal, date, field)`, is the one place "the value in effect
on day `D`" is computed (§2.5): look at the goal's `GoalRevision` rows with `effectiveFrom <= D`,
take the one with the greatest `effectiveFrom` (ties broken by greatest `id`), and read `field` from
it; if none qualify, read `field` from the `Goal` row itself. F-07 (streaks) and F-08 (summaries) call
the same function for `dailyTarget`. Since v1.4 the `endDate` side is read in several places too:
BR-10's own floor check, D-24's ended-goal check (§2 step 5), F-03's read endpoints (§2.6), the entry
date range in `POST /goals/:id/entries`, both BR-04 overlap call sites and the `lastDay` of
`GET /goals/:id/progress` (§3.2), and the `lastDay` of F-07 and F-08.

### 3.3 UI

Added in v1.3 (UI implementation start, as F-03 v1.2/F-04 v1.2 did). On the goal screen
(`frontend/src/GoalDetail.tsx`, F-04 §3.3), a "Revise goal" control opens a form pre-filled with the
currently effective `dailyTarget` and `endDate` (the values already on screen, from `GET /goals/:id`
per §2.6). Submitting sends `PATCH /goals/:id` with only the field(s) the Participant actually
changed from those prefilled values (§2's field rules — the other key is omitted, not sent
unchanged). On success the form closes and the goal screen shows the response's new effective
value(s) immediately (no extra `GET`, no page reload — the `PATCH` response body already is the
currently effective goal, §3.1). A 400, 404 or 409 is shown with the server's message verbatim and
the form stays open with what was typed (AC-03.18/AC-04.21 pattern); the submit control is disabled
while the request is in flight; a 401 returns to the login screen (AC-04.22 pattern). The control is
reachable only from the goal screen, which only a signed-in Participant viewing one of their own
goals can open at all (AC-03.16, AC-04.22 already gate this) — F-06's own UI adds no separate
role/ownership check.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-06.1 | The owner revising `dailyTarget` only, within the template's current range, receives 200 with the goal's currently effective values, `dailyTarget` updated and `endDate` unchanged; a new `GoalRevision` row is stored with `effectiveFrom` today. | FR-10, BR-10 |
| AC-06.2 | The owner revising `endDate` only, to a date not before today, the start date or the goal's latest entry date, and not creating an overlap, receives 200 with `endDate` updated and `dailyTarget` unchanged. | FR-10, BR-10 |
| AC-06.3 | The owner revising both `dailyTarget` and `endDate` in one request receives 200 with both updated, stored as one `GoalRevision` row. | FR-10, BR-10 |
| AC-06.4 | Anonymous requests to `PATCH /goals/:id` receive 401; a Manager receives 403; neither stores a revision. | NFR-02, BR-08 |
| AC-06.5 | A body that is not an object, an empty object, an unknown key, both keys absent, or a wrongly typed/shaped `dailyTarget` or `endDate` return 400 `Invalid goal revision fields.` and nothing is stored; a malformed `:id` returns 400 `Invalid goal id.` | NFR-05 |
| AC-06.6 | A goal that does not exist and another Participant's goal return the same 404, and no revision is stored. | BR-08 |
| AC-06.7 | A new `dailyTarget` below the template's current minimum or above its current maximum returns 400 `Daily target must be within the template range.` and nothing is stored; a value equal to the minimum or maximum is accepted. | BR-10 |
| AC-06.8 | A new `endDate` before today returns 400 `New end date must not be before today.`; before the goal's `startDate` returns 400 `New end date must not be before the goal's start date.`; before the goal's latest entry date (when it has entries) returns 400 `New end date must not be before the goal's latest entry date.`; each with nothing stored. When more than one floor is violated, the check order of §2.6 decides which message is returned. | BR-10 |
| AC-06.9 | A revised `endDate` that would overlap another of the Participant's goals on the same template (the goal being revised excluded from its own check) returns 409 `CONFLICT`, and nothing is stored; a revision that does not create an overlap, including one that now touches but does not overlap another goal, is accepted. | BR-10, BR-04 |
| AC-06.10 | After a revision, `GET /goals/:id` and the goal's row in `GET /goals` show the new currently effective value(s); before any revision, both show exactly the goal's original stored values (unchanged Sprint-1 behaviour). | FR-10 |
| AC-06.11 | A revision never changes, deletes or revalidates an existing entry (F-04); the goal's history (`GET /goals/:id/entries`) is unaffected by a revision. | BR-11, D-06 pattern |
| AC-06.12 | Two revisions on the same goal on the same calendar day: the later one (by creation order) is the one in effect for that day and afterward, until superseded by a later revision. | D-14 |
| AC-06.13 | The check order of §2 holds under combined faults: 401 before 400, 403 before 400, 404 before BR-10, BR-10 target/end-date checks before the BR-04 overlap re-check. | NFR-02, NFR-05, BR-08 |
| AC-06.14 (UI) | The goal screen shows a "Revise goal" control; opening it shows a form pre-filled with the currently effective `dailyTarget` and `endDate`. | FR-10, §3.3 |
| AC-06.15 (UI) | Submitting sends `PATCH /goals/:id` with only the field(s) actually changed from the prefilled values; on success the form closes and the screen shows the new effective value(s) from the response, with no extra request. | FR-10, §2 field rules |
| AC-06.16 (UI) | A 400, 404 or 409 from the revision request is shown with the server's message verbatim; the form keeps what was typed and stays open. | NFR-05 |
| AC-06.17 (UI) | The Revise submit control is disabled while the request is in flight. | NFR-05 |
| AC-06.18 (UI) | A 401 from the revision request returns the user to the login screen. | NFR-02 |
| AC-06.19 (UI) | The Revise control is only reachable from the goal screen, which only the owning Participant can open (AC-03.16, AC-04.22); this feature's UI adds no separate visibility check. | BR-08 |
| AC-06.20 | After an `endDate` revision extends a goal's end, `POST /goals/:id/entries` accepts an entry dated between the old (stale) end date and the new, revised end date. | BR-03, §3.2 |
| AC-06.21 | An entry dated after the goal's currently effective end date (whatever revisions have set it to) is rejected as outside the goal, using the effective end, never a stale stored one. | BR-03, §3.2 |
| AC-06.22 | BR-04's overlap check — at `POST /goals` creation and at `PATCH /goals/:id`'s own re-check — treats another of the Participant's goals as occupying its currently effective end date, not its stored one: a new or revised date range that only overlaps the other goal's *extended* end is rejected; one that only overlaps its original stored end but not its (shorter) effective end is not. | BR-04, §3.2 |
| AC-06.23 | `GET /goals/:id/progress`'s `daysElapsed`/`lastDay` (BR-09) is capped at the goal's currently effective end date, not its stored one; a day added to the window by an `endDate` extension is included once an entry exists for it. | BR-09, §3.2 |
| AC-06.24 | For a goal with zero revisions, AC-06.20 to AC-06.23's behaviour is bit-for-bit identical to Sprint 1 (the effective end date equals the stored one) — verified by the full existing regression suite (§5.3), not a separate new test. | §3.2 |
| AC-06.25 (D-24) | Any revision attempt (either field) on a goal whose currently effective end date is before today returns 409 `CONFLICT` `This goal has already ended and cannot be revised.`, and nothing is stored; a goal whose effective end date is today itself is not yet ended and a revision on it succeeds normally. | D-24 |

## 5. Software test specification (STS) — planned, not yet written as executable tests

| Test ID | Level | Covers | Input (summary) | Expected outcome |
| --- | --- | --- | --- | --- |
| TEST-06.1 | API/DB integration | AC-06.1 | `P1` `PATCH /goals/:G1` with `{ dailyTarget: 8 }`, `G1` target 5 on template 0–50 | 200, `dailyTarget` 8, `endDate` unchanged; one `GoalRevision` row, `effectiveFrom` = today |
| TEST-06.2 | API/DB integration | AC-06.2 | `P1` `PATCH /goals/:G1` with `{ endDate: "<today+30>" }`, no entries yet | 200, `endDate` updated, `dailyTarget` unchanged |
| TEST-06.3 | API/DB integration | AC-06.3 | `P1` `PATCH /goals/:G1` with both fields | 200, both updated; one revision row |
| TEST-06.4a | API integration | AC-06.4 | no cookie: `PATCH /goals/:G1` with `{ dailyTarget: 8 }` | 401 `UNAUTHENTICATED`; nothing stored |
| TEST-06.4b | API integration | AC-06.4 | `M` `PATCH /goals/:G1` with `{ dailyTarget: 8 }` | 403 `FORBIDDEN`; nothing stored |
| TEST-06.5a | API integration | AC-06.5 | `P1` `PATCH /goals/:G1` with `{}` | 400 `VALIDATION_ERROR` `Invalid goal revision fields.` |
| TEST-06.5b | API integration | AC-06.5 | `P1` `PATCH /goals/:G1` with `{ dailyTarget: 8, note: "x" }` | 400 `VALIDATION_ERROR` `Invalid goal revision fields.` |
| TEST-06.5c | API integration | AC-06.5 | `P1` `PATCH /goals/:G1` with `{ dailyTarget: "8" }` (string) | 400 `VALIDATION_ERROR` `Invalid goal revision fields.` |
| TEST-06.5d | API integration | AC-06.5 | `P1` `PATCH /goals/abc` | 400 `VALIDATION_ERROR` `Invalid goal id.` |
| TEST-06.6 | API/DB integration | AC-06.6 | **control** `P1` revises own goal (200); `P2` `PATCH` the same goal id and a non-existent id | both 404 `NOT_FOUND` `Goal not found.`, identical; nothing new stored |
| TEST-06.7a | API/DB integration | AC-06.7 | `G1` on template 0–50; `P1` `PATCH` with `dailyTarget` 51 | 400 `VALIDATION_ERROR` `Daily target must be within the template range.` |
| TEST-06.7b | API/DB integration | AC-06.7 | same; `dailyTarget` 0 and 50 | 200 for each (inclusive bounds) |
| TEST-06.8a | API/DB integration | AC-06.8 | `G1` ends in 30 days; `P1` `PATCH` with `endDate` = yesterday | 400 `New end date must not be before today.` |
| TEST-06.8b | API/DB integration | AC-06.8 | `G3`, a goal starting `today + 5` days (so the today floor is not also tripped); `P1` `PATCH` with `endDate` = the day before `G3.startDate` | 400 `New end date must not be before the goal's start date.` |
| TEST-06.8c | API/DB integration | AC-06.8 | `G1` has an entry dated `D`; `P1` `PATCH` with `endDate` = the day before `D` | 400 `New end date must not be before the goal's latest entry date.` |
| TEST-06.8d | API/DB integration | AC-06.8 | `G1` (starts in the past); `P1` `PATCH` with `endDate` = the day before `G1.startDate` (so both the today floor and the start-date floor are violated at once) | 400 `New end date must not be before today.` (proves the §2.6 check order: today checked before start date) |
| TEST-06.9a | API/DB integration | AC-06.9 | `P1` has two goals on the same template, non-overlapping; `P1` revises the first goal's `endDate` to overlap the second | 409 `CONFLICT`; nothing stored |
| TEST-06.9b | API/DB integration | AC-06.9 | same setup; `P1` revises the first goal's `endDate` to end the day before the second starts | 200 (touching, not overlapping, is allowed — same BR-04 rule as F-03) |
| TEST-06.10 | API/DB integration | AC-06.10 | `P1` revises `G1`'s target; `GET /goals/:G1` and `GET /goals` | both show the new target; an unrevised goal in the same `GET /goals` response still shows its original value |
| TEST-06.11 | API/DB integration | AC-06.11 | `G1` has entries; `P1` revises `G1`; `GET /goals/:G1/entries` | identical to before the revision |
| TEST-06.12 | API/DB integration | AC-06.12 | `P1` revises `G1` twice on the same (mocked) day, different targets | `effectiveOn(G1, today)` resolves to the second revision's target |
| TEST-06.13a | API/DB integration | AC-06.13 | no cookie, body `{}` | 401 (not 400) |
| TEST-06.13b | API/DB integration | AC-06.13 | **control** `P1` revises with an out-of-range target (400); then the same request with an also-overlapping `endDate` | 400 `Daily target...` (BR-10 target check before the BR-04 overlap re-check) |
| TEST-06.14 | Unit (pure function, no DB; **Decision D-15**, §2 note) | §2.5 resolution logic | `effectiveOn` called directly with a fabricated list of revisions (no revisions; one revision before `D`; one before and one after `D`; two revisions with the same `effectiveFrom`) | returns the goal's own value (none qualify); the qualifying revision's value; the later-`effectiveFrom` revision's value; the higher-`id` revision's value (D-14 tie-break) |
| TEST-06.21 | API/DB integration | AC-06.20 | `G` stored `endDate` day 10; revised to extend to day 20; `POST /goals/:id/entries` dated day 15 (between the two) | 201 — accepted against the effective end, not the stale stored end 10 |
| TEST-06.22 | API/DB integration | AC-06.21 | same `G` (effective end day 20); entry dated day 21 | 400 `Entry date must be within the goal's start and end dates.` |
| TEST-06.23a | API/DB integration | AC-06.22 | `Y` (template `T`) stored end day 10, revised/extended to day 20; **then** `POST /goals` a new `X` on `T` starting day 15 (inside `Y`'s extended window, outside `Y`'s original stored window) | 409 `CONFLICT` — creation-time overlap check reads `Y`'s effective end, not its stored one |
| TEST-06.23b | API/DB integration | AC-06.22 | `Y` as above (extended to day 20); `X` inserted directly on `T`, day 15 to day 25 (overlaps `Y`'s effective end only); `PATCH /goals/:X_id` re-asserting/extending `X`'s own `endDate` | 409 `CONFLICT` — the revision's own overlap re-check reads the *other* goal's (`Y`'s) effective end |
| TEST-06.24 | API/DB integration | AC-06.23 | `G` stored end day 10, revised/extended to day 20; `GET /goals/:id/progress` with "today" after day 20 | `daysElapsed` capped at day 20 (the effective end), not day 10 |
| TEST-06.25 | API/DB integration | AC-06.25 (D-24) | `G` whose effective end date is before "today" (never revised, or revised to a date now in the past relative to a later "today"); `PATCH /goals/:id` with any field | 409 `CONFLICT` `This goal has already ended and cannot be revised.`; nothing stored |
| TEST-06.26 | API/DB integration | AC-06.25 (D-24) | `G` whose effective end date equals "today" exactly; `PATCH /goals/:id` with `{ dailyTarget }` | 200 — not treated as ended |

### 5.2 Frontend tests

Test IDs start at TEST-06.15 (TEST-06.14 is already used by the backend unit test for `effectiveOn`,
§5.1). File: `frontend/src/GoalDetail.test.tsx`.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-06.15 | AC-06.14 | Goal screen rendered for `G1` (`dailyTarget` 5, `endDate` "2026-11-30"); "Revise goal" clicked | a form appears with the Daily target field showing `5` and the End date field showing `2026-11-30` |
| TEST-06.16a | AC-06.15 | Only the target field changed, to `8`; submitted; `PATCH /goals/11` returns 200 `{ ..., dailyTarget: 8, endDate: "2026-11-30" }` | `PATCH` called once with `{ dailyTarget: 8 }` only (no `endDate` key); the form closes; the goal screen shows target `8` |
| TEST-06.16b | AC-06.15 | Only the end date field changed, to `2026-12-15`; submitted; `PATCH` returns 200 with the new `endDate` | `PATCH` called with `{ endDate: "2026-12-15" }` only (no `dailyTarget` key); the screen shows the new end date |
| TEST-06.17 | AC-06.16 | Target changed to `999`; `PATCH /goals/11` mocked to 400 `Daily target must be within the template range.` | that exact message is shown; the form stays open with `999` still in the field |
| TEST-06.18 | AC-06.17 | `PATCH /goals/11` left pending | the Revise form's submit button is disabled until the request resolves |
| TEST-06.19 | AC-06.18 | Rendered through `App`; `PATCH /goals/11` mocked to 401 | the login form is shown |
| TEST-06.20 | AC-06.19 | `Goals` rendered as a Participant with one own goal, then (fresh render) as a Manager | Participant: opening the goal shows the "Revise goal" control; Manager: no goal screen exists to open at all (AC-03.16 — Manager sees no Goals section), so the control is unreachable by construction |

### 5.3 Regression — must stay unchanged

- All existing `TEST-01.*` through `TEST-05.*` (F-01 to F-05) must keep passing unmodified; none of
  their expected results depend on the `Goal` table shape and all exercise goals that are never
  revised in those tests, so §2.5's lookup falls through to the Sprint-1 behaviour for every one of
  them.
- `backend/tests/goals.test.ts` (F-03): every existing test creates a goal and never revises it, so
  `GET /goals`/`GET /goals/:id` must return exactly the values those tests already assert.
- `backend/tests/entries.test.ts` (F-04), specifically all `TEST-04.14*` to `TEST-04.16` (BR-09
  progress) and all `TEST-04.6*` to `TEST-04.8*` (BR-03 date-range checks): these goals are never
  revised, so BR-09's per-day target lookup and BR-03's/BR-09's end-date-in-effect lookup (§3.2, both
  planned changes) must still produce the exact same `daysMet`/`daysElapsed`/`progress` numbers and
  the exact same accept/reject outcomes those tests already assert. This is the regression check that
  both changes are a strict generalisation, not a behaviour change, for every goal with zero
  revisions (AC-06.24).
- `backend/tests/goals.test.ts` (F-03), specifically all `TEST-03.8*` to `TEST-03.10*` (BR-04
  overlap): none of those goals is ever revised, so comparing against "effective end" instead of
  "stored end" (§3.2) must produce the exact same overlap/no-overlap outcomes for every one of them.

## 6. Definition of done

- [x] This contract is committed before any implementation code (this PR).
- [x] Migration adding `GoalRevision` is written and committed before the route code that uses it.
- [x] Tests TEST-06.1 to TEST-06.14 and TEST-06.15 to TEST-06.20 (UI) are committed and fail first
      (red) before their respective implementation, with the failing output saved under
      `docs/sprints/sprint-2/evidence/` (`F-06-red-output.txt`, `F-06-ui-red-output.txt`).
- [x] Implementation makes TEST-06.1 to TEST-06.20 pass (green), with the passing output saved
      (`F-06-green-output.txt`, `F-06-ui-green-output.txt`).
- [x] The BR-09 `dailyTarget` per-day change (§3.2) to `GET /goals/:id/progress` is implemented and
      the regression tests in §5.3 still pass with identical numbers for unrevised goals.
- [ ] **New in v1.4 (review finding, warunwora):** TEST-06.21 to TEST-06.26 are committed red before
      their implementation, with the failing output saved to
      `docs/sprints/sprint-2/evidence/F-06-review-fix-red-output.txt`.
- [ ] **New in v1.4:** the end-date-in-effect fix (§3.2: `POST /goals/:id/entries`, both BR-04 overlap
      call sites, `GET /goals/:id/progress`) and the D-24 ended-goal 409 are implemented; TEST-06.21
      to TEST-06.26 pass (green), saved to `F-06-review-fix-green-output.txt`; the §5.3 regression
      tests (now including `TEST-03.8*`-`03.10*` and `TEST-04.6*`-`04.8*`) still pass unchanged.
- [x] `npm test` in `backend/` passes from a clean checkout with no failing or skipped tests (re-run
      and re-confirmed after the v1.4 fix, not just at v1.0/v1.3).
- [x] No existing test file is edited except where §5.3 requires re-running (not changing expected
      results of) existing BR-09/BR-03/BR-04 tests.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked. (PR #76 itself:
      reviewed by warunwora, changes requested 2026-11-28, addressed in v1.4 above; PR #84
      implementation: reviewer requested, not yet approved.)
- [x] The three proposed decisions (D-13, D-14, D-15) **and the new D-24** are resolved by the
      reviewer: warunwora accepted all four as written on PR #76 (2026-11-28, https://github.com/asamapornch/habit-activity-tracker/pull/76#issuecomment-7229307813),
      and the SRS §7 rows are updated to settled wording (v1.5).
- [x] UI section (§3.3) is filled in with AC/STS at the start of the implementation phase, following
      the same pattern F-03 v1.2 and F-04 v1.2 used (v1.3).
- [x] TEST-06.15 to TEST-06.20 are committed red before the UI code, then green.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-27 | Initial contract, written before any implementation | Sprint 2 planning (`docs/sprints/plan.md` §3) |
| 1.2 | 2026-11-27 | STS fixture corrected, TEST-06.8d added; found while writing RED tests, before any implementation; no AC or behaviour change. TEST-06.8b now uses a new fixture `G3` (startDate = today + 5) so the start-date floor is reachable without also tripping the today floor, per §2.6's own check-order rule; TEST-06.8d is new and proves that same check order (today checked before start date) using `G1` alone. | Contract problem found while writing TEST-06.8b against the STS's own check-order rule, before any implementation code; reviewed and decided by the author before Step 3 resumed |
| 1.3 | 2026-11-27 21:56 +07 | UI AC/STS added at implementation start, as F-03/F-04 did; no backend behaviour change. §3.3 filled in; AC-06.14 to AC-06.19 and TEST-06.15 to TEST-06.20 added (§5.2). | UI implementation start, following F-03 v1.2/F-04 v1.2 |
| 1.4 | 2026-11-28 02:34 +07 | Review finding by warunwora on #76; no scope creep. §3.2 corrected: `POST /goals/:id/entries`, both BR-04 overlap call sites and `GET /goals/:id/progress` were wrongly claimed to need no change for `endDate` — they read the stored column directly and must instead use the end date in effect (`effectiveOn(..., "endDate")`). AC-06.20 to AC-06.24 added for this. New Decision D-24 (proposed): revising an already-ended goal returns 409 `CONFLICT` "This goal has already ended and cannot be revised."; AC-06.25 added. TEST-06.21 to TEST-06.26 added (§5.1). Header Status, Owner and Reviewer corrected to match actual PR state (was stale at "no code yet" since v1.3). | Review finding by warunwora on #76; no scope creep |
| 1.5 | 2026-11-28 | D-13, D-14, D-15 and D-24 settled: warunwora accepted all four as written on #76; "(proposed, needs review)" removed from the header, §2 steps 5 and 7, §2.5, §3.1, AC-06.12, AC-06.25 and TEST-06.14; §6 item checked. §3.4 last sentence corrected: since v1.4 the `endDate` side of `effectiveOn` is also read by D-24, the entry date range, both BR-04 overlap call sites and the progress and F-07/F-08 `lastDay`. No behaviour, AC or test change. | Re-review by warunwora on #76 (2026-11-28) |
| 1.6 | 2026-11-28 | Status only: PR #84 merged to `sprint-1-staging`. No behaviour, AC or test change. | Combined Sprint 2/3 docs update after the merges |
