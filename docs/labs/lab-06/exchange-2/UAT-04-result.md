# UAT-04 State, history and persistence — Result record

## Preconditions check

| # | Precondition | Result |
|---|---|---|
| 1 | Deployed release/URL named in handoff | `build 50f5605` shown again — matches. |
| 2 | No template named "UAT-04 Stretch" | Confirmed on Templates page before A2: no such row. |
| 3 | Today = D, real dates recorded | D = 2026-11-25 (Asia/Bangkok). |
| 4 | Parts run in order A,B,C,D,E,F, one sitting, finished before 24:00 | Done, same session, same date. |

## Result record

| Field | Entry |
|---|---|
| Tester name and team | Asamaporn Chayanuntasakul (asamapornch) and warunwora, team Habit and Activity Tracker. Both team members sat together during the session. The browser steps were run by Claude Code (AI agent) under their direct supervision. warunwora gave his opinion on the UAT results during the session. |
| Date and time | 2026-11-25, approx. 14:40-14:49, derived from evidence file modification times; not a stopwatch record, Asia/Bangkok |
| Tested version | `build 50f5605` |
| Real dates used | D-5=2026-11-20, D-4=2026-11-21, D-2=2026-11-23, D-1=2026-11-24, D=2026-11-25 |

### Actual result per step

**Part A — unused template can be edited (M1)**

| Step | Actual result | Compare |
|---|---|---|
| A1 | Templates page: table + "New" button; no "UAT-04 Stretch" row | matches |
| A2 | Row created: "UAT-04 Stretch, minutes, 1–50, Active" with Edit | matches |
| A3 | "Edit template" form opened, filled with UAT-04 Stretch / minutes / 1 / 50 | matches |
| A4 | No error; row now shows "UAT-04 Stretch, minutes, 1–60, Active" | matches |
| A5 | Logged out; login screen shown | matches |

**Part B — already-ended goal with three entries (P1)**

| Step | Actual result | Compare |
|---|---|---|
| B1 | Goals page opened; no goal on UAT-04 Stretch | matches |
| B2 | Goal created: UAT-04 Stretch, "Daily target: 10 minutes", 2026-11-20–2026-11-24, state "Ended", "0 of 5 days met", "No entries yet" | matches |
| B3 | Entry "2026-11-20: 10 minutes"; progress "1 of 5 days met" | matches |
| B4 | "2026-11-21: 9 minutes" above prior entry; progress stayed "1 of 5 days met" | matches |
| B5 | Entries top-to-bottom "2026-11-24: 30", "2026-11-21: 9", "2026-11-20: 10"; progress "2 of 5 days met"; state stayed "Ended" | matches |
| B6 | Logged out; login screen shown | matches |

**Part C — template used only by an Ended goal is still locked (M1)**

| Step | Actual result | Compare |
|---|---|---|
| C1 | "Edit template" form filled with UAT-04 Stretch / minutes / 1 / 60 | matches |
| C2 | "This template is used by a goal and cannot be edited." Maximum box retained typed "55" | matches |
| C3 | Templates page row still shows "1–60" (not 1–55); unchanged | matches |
| C4 | Logged out; login screen shown | matches |

**Part D — new goal while earlier is Ended; Active on end day (P1)**

| Step | Actual result | Compare |
|---|---|---|
| D1 | No error; two UAT-04 Stretch goals listed, newest first: new one "Daily target: 20 minutes", 2026-11-23–2026-11-25, Active, "0 of 3 days met", "No entries yet"; older one unchanged (Ended, "2 of 5 days met", 3 entries) | matches |
| D2 | "2026-11-23: 25 minutes"; progress "1 of 3 days met" (25 above target 20) | matches |
| D3 | "2026-11-24: 19 minutes" above prior entry; progress stayed "1 of 3 days met" (19 below 20) | matches |
| D4 | Entries top-to-bottom "2026-11-25: 20", "2026-11-24: 19", "2026-11-23: 25"; progress "2 of 3 days met" (20 equals target); state still Active | matches |
| D5 | Older goal unchanged: Ended, "2 of 5 days met", same three entries, not mixed with new goal | matches |

**Part E — reload, then logout/login (P1)**

| Step | Actual result | Compare |
|---|---|---|
| E1 | Reload: both goals identical to pre-reload state (targets, dates, states, progress, entries) | matches |
| E2 | Logged out; login screen shown | matches |
| E3 | Logged in again: both goals identical to the state in E1 — nothing lost | matches |
| E4 | Logged out; login screen shown | matches |

**Part F — the template survived too (M1)**

| Step | Actual result | Compare |
|---|---|---|
| F1 | Templates page: row "UAT-04 Stretch, minutes, 1–60, Active" as left in Part C | matches |
| F2 | Changing Name to "UAT-04 Stretch 2" (other fields unchanged): "This template is used by a goal and cannot be edited." (refused on name alone now that two goals use it) | matches |
| F3 | Templates page still shows "UAT-04 Stretch" (not "UAT-04 Stretch 2"), range "1–60"; no second row | matches |
| F4 | Logged out; login screen shown | matches |

### Evidence

Screenshots `UAT-04-A1.png` through `UAT-04-F4` equivalents in `~/uat-work/results/evidence/` (`A1`–`A4`, `B2`–`B5`, `C1`–`C3`, `D1`–`D5`, `E1`, `E3`, `F1`–`F3`; steps that are simple logouts with no new visual state weren't separately screenshotted).

### Notes

Two M1 logins in this case initially needed a password retry ("Username or password is incorrect" on first attempt, succeeded on second) — same pattern seen in UAT-03. Not an application defect; noted for your tracking.

### Issue ID if FAIL

N/A — no application differences found.

## Suggested verdict

**suggested: PASS**

Every step in Parts A–F produced its expected result: the unused template was editable (A4); the used template was refused and left unchanged every time (C2/C3, F2/F3); the goal ending today was Active and the one that ended yesterday was Ended (B2, D1); a second goal on the same template was accepted once the first was Ended (D1); and both goals' full state (targets, dates, states, progress, entries) survived both a reload (E1) and a full logout/login (E3).

## Final verdict (tester-confirmed)

**PASS** — confirmed by asamapornch, who read the raw results on 2026-11-26, after reviewing evidence screenshots for C2, C3, D1, E1, E3, F2 and F3.

## Cleanup / sequence note

After this case: template `UAT-04 Stretch` exists with range `1–60`; P1 has two goals on it (5 and 3 entries respectively). Per the handoff, a reset is needed before UAT-04 is run again. This was the last case in the fixed order (UAT-01→02→03→04).
