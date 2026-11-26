# UAT-02 Business rules and boundaries — Result record

## Preconditions check

| # | Precondition | Result |
|---|---|---|
| 1 | Deployed release/URL named in handoff | `build 50f5605` shown again on login before this case — matches. |
| 2 | Templates Water (1–12) and Reading (1–100) exist, active | Confirmed on M1's Templates page (step A1): Water glasses 1–12 Active; Reading pages 1–100 Active. |
| 3 | No template named "UAT-02 Squats" | Confirmed: no such row on Templates page before A2. |
| 4 | P2 has no goals | Confirmed: "No goals yet" on P2's goals page (step B1). |
| 5 | Today = D, real dates recorded | D = 2026-11-25 (Asia/Bangkok). |
| 6 | Parts run in order A→B→C→D, one sitting | Done, same session, same date. |

## Result record

| Field | Entry |
|---|---|
| Tester name and team | Asamaporn Chayanuntasakul (asamapornch) and warunwora, team Habit and Activity Tracker. Both team members sat together during the session. The browser steps were run by Claude Code (AI agent) under their direct supervision. warunwora gave his opinion on the UAT results during the session. |
| Date and time | 2026-11-25, approx. 14:03-14:17, derived from evidence file modification times; not a stopwatch record, Asia/Bangkok |
| Tested version | `build 50f5605` |
| Real dates used | D-10=2026-11-15, D-5=2026-11-20, D-4=2026-11-21, D-3=2026-11-22, D-2=2026-11-23, D-1=2026-11-24, D=2026-11-25, D+1=2026-11-26, D+3=2026-11-28, D+6=2026-12-01 |

### Actual result per step

**Part A — template range (M1)**

| Step | Actual result | Compare |
|---|---|---|
| A1 | Templates page: table Name/Unit/Range/State/Edit, "New" button; Water 1–12, Reading 1–100 | matches |
| A2 | "Minimum must be below maximum." Form stayed open, all 4 fields retained typed values | matches |
| A3 | Same message "Minimum must be below maximum." Form stayed open | matches |
| A4 | Templates page; one row "UAT-02 Squats, reps, 10–50, Active"; no duplicate row | matches |
| A5 | Logged out; login screen shown | matches |

**Part B — goal target / one active goal per template (P2)**

| Step | Actual result | Compare |
|---|---|---|
| B1 | Goals page: "No goals yet", "+ New goal" | matches |
| B2 | "Daily target must be above the template minimum." Unit "reps" shown; values retained | matches |
| B3 | Same message (target 9) | matches |
| B4 | "Daily target must not exceed the template maximum." (target 51) | matches |
| B5 | Target 50: goal created — "UAT-02 Squats", "Daily target: 50 reps", 2026-11-25–2026-12-01, Active, "0 of 1 days met". (Note: my own test-automation hit a tooling glitch on this step — see "Tooling notes" below — and had to re-verify the field value before the real result was obtained; this is not an app defect.) | matches |
| B6 | Second goal on same template: "You already have an active goal for this template." | matches |
| B7 | Cancel: exactly one goal on UAT-02 Squats (target 50), unchanged | matches |

**Part C — entry value/date/one-per-day (P2)**

| Step | Actual result | Compare |
|---|---|---|
| C1 | Second goal: Water, "Daily target: 8 glasses", 2026-11-22–2026-11-28, Active, "0 of 4 days met", "No entries yet" | matches |
| C2 | Value 0: "The value must be between 1 and 12." Still "No entries yet", value box showed 0 | matches |
| C3 | Value 13: same message | matches |
| C4 | Date 2026-11-22 (D-3), value 1: entry "2026-11-22: 1 glasses"; progress "0 of 4 days met" | matches |
| C5 | Date 2026-11-23 (D-2), value 12: "2026-11-23: 12 glasses" above prior entry; progress "1 of 4 days met" | matches |
| C6 | Date 2026-11-21 (D-4), value 5: "The date must be inside the goal start and end dates." List unchanged (2 entries) | matches |
| C7 | Date 2026-11-26 (D+1), value kept 5: "The date cannot be after today." List unchanged | matches |
| C8 | Date 2026-11-25 (D), value 8: "2026-11-25: 8 glasses" at top; progress "2 of 4 days met" | matches |
| C9 | Date kept at D, value 9: "An entry already exists for this day." List unchanged (3 entries, still shows 8 not 9); progress stays "2 of 4 days met" | matches |
| C10 | Date 2026-11-24, value 1.555: "Enter a valid date (YYYY-MM-DD) and a number with at most 2 decimal places." List unchanged (3 entries) | matches |
| C11 | Date cleared (empty), value 5: same message as C10. List unchanged (3 entries) | matches |

**Part D — a goal that has ended (P2)**

| Step | Actual result | Compare |
|---|---|---|
| D1 | Third goal: Reading, "Daily target: 20 pages", 2026-11-15–2026-11-20, state "Ended", "0 of 6 days met" | matches |
| D2 | Date 2026-11-21 (day after end), value 20: "The date must be inside the goal start and end dates." Still "No entries yet" | matches |
| D3 | Date 2026-11-20 (end day), value 20: "2026-11-20: 20 pages"; state stays "Ended"; progress "1 of 6 days met" | matches |
| D4 | Reload (F5): all three goals unchanged — UAT-02 Squats "0 of 1 days met", Water "2 of 4 days met" (3 entries), Reading "1 of 6 days met" (1 entry) | matches |
| D5 | Logged out; login screen shown | matches |

### Evidence

Screenshots `UAT-02-A1.png` through `UAT-02-D5.png` (image withheld from the repository because it showed a masked password field; the step result is recorded in the text above) in `~/uat-work/results/evidence/` (one per step; `UAT-02-B5-check.png` and `UAT-02-C2.png` etc. include intermediate verification shots).

`UAT-02-A4.png` (same screenshot as `UAT-03-C1.png`, `UAT-04-A1.png`; one screen supports several steps). `UAT-02-B5.png` (same screenshot as `UAT-02-B7.png`; one screen supports several steps). `UAT-02-B7.png` (same screenshot as `UAT-02-B5.png`; one screen supports several steps).

### Tooling notes (not app findings)

During Parts B–D, my own browser-automation script (not the application) twice produced incorrect-looking field values that were **not** actually submitted:
1. On B5, a "select all + backspace" helper I used accidentally clicked the number input's up/down spinner arrows, inflating the typed value before I verified and corrected it.
2. On C9/D2/D3, Chrome's native behavior of incrementing/decrementing a *focused* `<input type="number">` when the page scrolls under the cursor caused the field's displayed value to drift between my actions (triggered by my own full-page screenshots). I added a blur-before-screenshot step to stop this.

In both cases I verified the actual field value immediately before clicking any "Save"/"Save entry" button, so every real request sent to the app used the correct, case-specified values. These are recorded here for transparency but are not being reported as application defects.

### Issue ID if FAIL

N/A — no application differences found.

## Suggested verdict

**suggested: PASS**

All steps across Parts A–D produced their expected results. Two transient glitches occurred in my own test tooling (noted above); neither affected what was actually submitted to or returned by the application.

## Final verdict (tester-confirmed)

**PASS** — confirmed by asamapornch (warunwora gave his opinion on the results) after reviewing evidence screenshots for steps B5, C9, D3 and D4, and the tooling notes.

## Cleanup / sequence note

After this case: template `UAT-02 Squats` exists (10–50 reps); P2 now has three goals (UAT-02 Squats target 50, Water target 8 with 3 entries, Reading target 20 with 1 entry — ended). Per the handoff, a reset is needed before re-running UAT-02. This result does not depend on UAT-01 (P1) and does not block UAT-03 or UAT-04 by itself, though the handoff's fixed order (UAT-01→02→03→04) should still be followed.
