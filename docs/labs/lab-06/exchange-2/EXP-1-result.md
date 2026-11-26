# EXP-1 Exploratory UAT round — Result record

Scope: acceptance criteria from `docs/sprints/sprint-1/F-03-template-create.md`, `F-04-template-edit.md`, `F-07-goal.md` and `F-08-entry.md` that are not covered by UAT-01 through UAT-04: **AC-03.3, AC-03.4, AC-04.3, AC-04.4, AC-04.5, AC-07.6, AC-08.12**.

| Field | Entry |
|---|---|
| Tester | Asamaporn Chayanuntasakul (asamapornch) and warunwora, team Habit and Activity Tracker. Both team members sat together during the session. The browser/API steps were run by Claude Code (AI agent) under their direct supervision; warunwora gave his opinion on the UAT results during the session. The human testers decided the final verdict. |
| Date and time | 2026-11-25, approx. 15:06-17:35 (start from the first agent message of the run, end from the result file time; only one screenshot, 17:34), derived from evidence file modification times; not a stopwatch record, Asia/Bangkok |
| Tested version | `build 50f5605` (confirmed on login page before and during the round) |
| Method | Template/goal creation and edit checks run as in-page `fetch()` calls (same style as UAT-03's console steps) against the live app, in the same session as a logged-in Manager (M1) or Participant (P1). The AC-08.12 check used the real browser UI. |
| Naming | All templates/goals created in this round use the `EXP-` prefix: `EXP-Dup`, `exp-dup`, `EXP-EditA`, `EXP-EditB` |

**Result: no differences found anywhere in this round. No 5xx responses. No findings to draft.**

---

## AC-03.3 — template creation validation (M1, `POST /api/templates`)

Baseline fields otherwise valid; one bad field per attempt.

| # | Input (bad field) | Expected | Actual | Compare |
|---|---|---|---|---|
| 1 | `name` missing | 400 VALIDATION_ERROR | `400 {"error":{"code":"VALIDATION_ERROR","message":"Name must be 1 to 100 characters."}}` | matches |
| 2 | `name` `""` | 400 VALIDATION_ERROR | same message | matches |
| 3 | `name` `"   "` | 400 VALIDATION_ERROR | same message | matches |
| 4 | `name` `12345` (non-string) | 400 VALIDATION_ERROR | same message | matches |
| 5 | `name` 101 chars | 400 VALIDATION_ERROR | same message (confirmed length 101) | matches |
| 6 | `unit` missing | 400 VALIDATION_ERROR | `"Unit must be 1 to 30 characters."` | matches |
| 7 | `unit` `""` | 400 VALIDATION_ERROR | same message | matches |
| 8 | `unit` `"   "` | 400 VALIDATION_ERROR | same message | matches |
| 9 | `unit` 31 chars | 400 VALIDATION_ERROR | same message (confirmed length 31) | matches |
| 10 | `minValue` missing | 400 VALIDATION_ERROR | `"Minimum must be a number with at most 2 decimal places."` | matches |
| 11 | `minValue` `"abc"` | 400 VALIDATION_ERROR | same message | matches |
| 12 | `minValue` `1.555` | 400 VALIDATION_ERROR | same message | matches |
| 13 | `maxValue` missing | 400 VALIDATION_ERROR | `"Maximum must be a number with at most 2 decimal places."` | matches |
| 14 | `maxValue` `"xyz"` | 400 VALIDATION_ERROR | same message | matches |
| 15 | `maxValue` `50.555` | 400 VALIDATION_ERROR | same message | matches |
| 16 | `maxValue` `100000000` (exceeds `Decimal(10,2)`) | 400 VALIDATION_ERROR | same message ("...at most 2 decimal places") | matches* |

\* Observation (not a stop-worthy difference): attempt 16's value is a whole number with **zero** decimal places — it fails only because it exceeds the magnitude `Decimal(10,2)` allows (99,999,999.99), not because of decimal places. The message text blames "decimal places," which is not the actual reason. The status code and overall behavior (reject, nothing stored) correctly satisfy `VALIDATION_ERROR`; AC-03.3's own wording doesn't specify exact message text for the magnitude case, so this is not recorded as a "differs." Flagged here for the Product Team's awareness only.

Nothing stored in any of the 16 attempts.

Screenshots: none (console/API-only, no distinct visual page state — consistent with the practice established in UAT-03).

## AC-03.4 — duplicate template name, including case (M1)

| # | Action / input | Expected | Actual | Compare |
|---|---|---|---|---|
| 1 | Create `EXP-Dup` (unit x, 1–10) | 201 | `201 {"template":{"id":15,"name":"EXP-Dup","unit":"x","minValue":1,"maxValue":10,"state":"ACTIVE"}}` | matches |
| 2 | Create `EXP-Dup` again, same case (2–20) | 409 TEMPLATE_NAME_EXISTS | `409 {"error":{"code":"TEMPLATE_NAME_EXISTS","message":"A template with this name already exists."}}` | matches |
| 3 | Create `exp-dup` lowercase (3–30) | Per contract OP-03.1 (exact match, case-sensitive): 201 accepted | `201 {"template":{"id":17,"name":"exp-dup","unit":"x","minValue":3,"maxValue":30,"state":"ACTIVE"}}` | matches |
| 4 | Create `EXP-Dup` again with invalid range (5–5) | 400 MIN_NOT_BELOW_MAX (not 409 — validation order) | `400 {"error":{"code":"MIN_NOT_BELOW_MAX","message":"Minimum must be below maximum."}}` | matches |

Confirms the contract's decided case-sensitive exact-match duplicate check, and the documented check order (range rule checked before duplicate-name rule).

## AC-04.3 / AC-04.4 — template edit, range/name rules and validation (M1)

Setup: created unused `EXP-EditA` (id 18, unit a, 1–10) and `EXP-EditB` (id 19, unit b, 1–5).

**AC-04.3**

| # | Action | Expected | Actual | Compare |
|---|---|---|---|---|
| 1 | PATCH EditA `{minValue:10}` (equals current max) | 400 MIN_NOT_BELOW_MAX | `400 {"error":{"code":"MIN_NOT_BELOW_MAX","message":"Minimum must be below maximum."}}` | matches |
| 2 | PATCH EditA `{name:"EXP-EditB"}` | 409 TEMPLATE_NAME_EXISTS | `409 {"error":{"code":"TEMPLATE_NAME_EXISTS","message":"A template with this name already exists."}}` | matches |
| 3 | PATCH EditA `{name:"EXP-EditA"}` (own current name) | 200 accepted | `200 {"template":{"id":18,"name":"EXP-EditA","unit":"a","minValue":1,"maxValue":10,"state":"ACTIVE"}}` | matches |

**AC-04.4**

| # | Action | Expected | Actual | Compare |
|---|---|---|---|---|
| 4 | PATCH EditA `{}` | 400 VALIDATION_ERROR | `400 {"error":{"code":"VALIDATION_ERROR","message":"Change at least one of name, unit, minimum or maximum."}}` | matches |
| 5 | PATCH EditA `{minValue:"abc"}` | 400 VALIDATION_ERROR | `"Minimum must be a number with at most 2 decimal places."` | matches |
| 6 | PATCH EditA `{maxValue:10.555}` | 400 VALIDATION_ERROR | `"Maximum must be a number with at most 2 decimal places."` | matches |
| 7 | PATCH `/api/templates/abc` `{unit:"z"}` | 400 VALIDATION_ERROR | `"Template id must be a positive whole number."` | matches |
| 8 | PATCH `/api/templates/999999` `{unit:"z"}` | 404 TEMPLATE_NOT_FOUND | `404 {"error":{"code":"TEMPLATE_NOT_FOUND","message":"Template not found."}}` | matches |
| 9 | PATCH EditA with no session (`credentials:'omit'`) | 401 UNAUTHENTICATED | `401 {"error":{"code":"UNAUTHENTICATED","message":"Please log in."}}` | matches |

Verified after all 9 attempts: `GET /api/templates` shows EXP-EditA unchanged — `{"id":18,"name":"EXP-EditA","unit":"a","minValue":1,"maxValue":10,"state":"ACTIVE"}`.

Observation: attempt 4's message text matches the contract's `OP-04.9` proposed wording exactly, even though that open point's status was listed as "Open (proposal)" — already implemented as proposed.

## AC-04.5 — edit of a used template that also breaks the range rule (M1)

| Action | Expected | Actual | Compare |
|---|---|---|---|
| PATCH the already-used `UAT-02 Squats` (id 13, currently 10–50) with `{minValue:50, maxValue:50}` | 409 TEMPLATE_IN_USE (not 400 — in-use check outranks range check) | `409 {"error":{"code":"TEMPLATE_IN_USE","message":"This template is used by a goal and cannot be edited."}}` | matches |

Verified unchanged: `{"id":13,"name":"UAT-02 Squats","unit":"reps","minValue":10,"maxValue":50,"state":"ACTIVE"}`.

## AC-07.6 — goal creation validation (P1, `POST /api/goals`, template Water id=3)

| # | Input (bad field) | Expected | Actual | Compare |
|---|---|---|---|---|
| 1 | `templateId` missing | 400 VALIDATION_ERROR | `"Choose a template, a valid daily target and valid start and end dates."` | matches |
| 2 | `templateId` `"abc"` | 400 VALIDATION_ERROR | same message | matches |
| 3 | `templateId` `999999` | 400 VALIDATION_ERROR (per OP-07.1, not 404) | `"Choose an existing template."` | matches |
| 4 | `dailyTarget` missing | 400 VALIDATION_ERROR | combined message (as #1) | matches |
| 5 | `dailyTarget` `"xyz"` | 400 VALIDATION_ERROR | combined message | matches |
| 6 | `dailyTarget` `0` | 400 VALIDATION_ERROR (not TARGET_NOT_ABOVE_TEMPLATE_MIN) | combined message | matches |
| 7 | `dailyTarget` `-5` | 400 VALIDATION_ERROR | combined message | matches |
| 8 | `dailyTarget` `7.555` | 400 VALIDATION_ERROR | combined message | matches |
| 9 | `dailyTarget` `100000000` | 400 VALIDATION_ERROR | combined message | matches |
| 10 | `startDate` missing | 400 VALIDATION_ERROR | combined message | matches |
| 11 | `startDate` `"25-11-2026"` (bad format) | 400 VALIDATION_ERROR | combined message | matches |
| 12 | `endDate` missing | 400 VALIDATION_ERROR | combined message | matches |
| 13 | `endDate` before `startDate` | 400 VALIDATION_ERROR | `"End date must be on or after start date."` (more specific message) | matches |

Verified after all 13 attempts: `GET /api/goals` for P1 shows exactly the 4 pre-existing goals (ids 2, 7, 8, 9) — no stray goal created.

## AC-08.12 — entry date box defaults to Bangkok "today" regardless of browser timezone (P1, UI)

Setup: a second, independent Chrome instance was launched with a fresh profile and the OS-level `TZ` environment variable set to `Pacific/Pago_Pago` (UTC-11, no DST). Confirmed via in-page `Intl.DateTimeFormat().resolvedOptions().timeZone` and `new Date().toString()`: this window's browser resolved to `Pacific/Pago_Pago`, local clock reading **Tue Nov 24 2026, 23:31** — a full calendar day behind Bangkok's Nov 25.

| Action | Expected | Actual | Compare |
|---|---|---|---|
| P1 logged in to this second window; checked the Date box on every goal's entry form (UAT-04 Stretch ×2, Walking, Water) | Date box defaults to today in Asia/Bangkok (2026-11-25), regardless of browser timezone | All four goals' Date boxes showed `25/11/2026` | matches |

Evidence: `EXP-1-AC-08.12.png` (same screenshot as `UAT-04-D4.png`, `UAT-04-D5.png`, `UAT-04-E1.png`, `UAT-04-E3.png`; one screen supports several steps).

---

## Findings

None — every attempt in this round matched its expected result. No defect reports to draft.

## Notes for the Product Team

- `EXP-Dup`, `exp-dup`, `EXP-EditA` and `EXP-EditB` templates now exist in the deployed database (ids 15, 17, 18, 19). These are unused by any goal. The partner's standard reset script (`docs/labs/lab-06/reset-runbook.md` / `uat-reset.sql`) only mentions removing `UAT-*` templates and P1/P2 goal data — it does not appear to cover `EXP-*` names, so manual cleanup of these four templates may be needed.
- `UAT-02 Squats` (id 13) was targeted by one refused PATCH (AC-04.5) — confirmed left unchanged (still 10–50 reps).
- No account's other data was touched.
- Duplicate names are compared case-sensitively according to OP-03.1 in `F-03-template-create.md`, so the 201 for `exp-dup` matches the contract.
- This run was executed on the partner's deployed app from about 15:06 to 17:35 on 2026-11-25. The notice about AI use and about the test records left on their app was not sent to the partner before the run; it was posted on 2026-11-26 at 15:48 (Asia/Bangkok) in https://github.com/phittayanan/habit-tracker/issues/130.

## Suggested verdict

**suggested: PASS** (for all seven ACs tested in this round) — no defects found against any of AC-03.3, AC-03.4, AC-04.3, AC-04.4, AC-04.5, AC-07.6, or AC-08.12.

## Final verdict (tester-confirmed)

**PASS** — confirmed by asamapornch on 2026-11-26.
