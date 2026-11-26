# UAT-01 Normal journey — Result record

## Preconditions check

| # | Precondition | Result |
|---|---|---|
| 1 | Deployed release/URL named in handoff | URL `https://habit-tracker-rfi4eg2u4q-as.a.run.app` opened; login page shows `build 50f5605` — matches handoff's version under test (tag `v1.3`, commit `50f5605d26...`). |
| 2 | Template Water exists (glasses, min 1, max 12) | Confirmed via New-goal template dropdown (step 3) and selecting Water (step 4): unit shown as "glasses". |
| 3 | P1 has no goal on Water | Confirmed: goals page showed "No goals yet" immediately after login (step 2). |
| 4 | Today = D, real dates recorded | D = 2026-11-25 (Asia/Bangkok). |

## Result record (per case template, section 8 of handoff)

| Field | Entry |
|---|---|
| Tester name and team | Asamaporn Chayanuntasakul (asamapornch) and warunwora, team Habit and Activity Tracker. Both team members sat together during the session. The browser steps were run by Claude Code (AI agent) under their direct supervision. warunwora gave his opinion on the UAT results during the session. |
| Date and time | 2026-11-25, approx. 13:34-13:54, derived from evidence file modification times; not a stopwatch record, Asia/Bangkok |
| Tested version (revision or tag shown in the handoff) | `build 50f5605` (matches tag `v1.3`, commit `50f5605d266d881b4afba3f8ac96d40882f26fd2`) |
| Real dates used for `D-2`, `D-1`, `D`, `D+27` | D-2 = 2026-11-23, D-1 = 2026-11-24, D = 2026-11-25, D+27 = 2026-12-22 |

### Actual result per step

| Step | Action | Actual result | Expected | Compare |
|---|---|---|---|---|
| 1 | Opened app URL in fresh private-context browser (no session) | Login screen: "Log in" heading, Username box, masked Password box, "Log in" button, no sign-up/forgot-password link, "build 50f5605" shown | Login screen with username/password/Log-in, no sign-up/forgot-password | matches |
| 2 | Logged in as P1 (participant1) | Goals page opened. Top bar: "Participant One", "Goals", "Templates", "build 50f5605", "Log out". Body: "Goals", "+ New goal", "No goals yet" | Goals page opens, menu has Goals/Templates/Log out, "No goals yet", "+ New goal" visible | matches |
| 3 | Pressed "+ New goal" | Form: Template dropdown ("Choose a template", Reading, Walking, Water), Daily target box, Start date = 25/11/2026 (today, D), End date box, Save button, (also a Cancel button) | Template dropdown with Water listed, daily target box, start date defaulting to today, end date, Save button | matches |
| 4 | Chose Water | "glasses" unit text appeared directly below the Daily target box | Unit "glasses" shown next to the target box | matches (minor layout note: unit text appears below the box rather than beside it; same information shown) |
| 5 | Entered target 8, start 23/11/2026, end 22/12/2026, pressed Save | No error shown. Goals page listed one goal: Water, "Daily target: 8 glasses", "2026-11-23 – 2026-12-22", "Active", "0 of 3 days met" | Form accepts it; goal listed: Water, target 8 glasses, D-2–D+27, Active, "0 of 3 days met" | matches |
| 6 | Set Date=2026-11-23, Value=8, Save entry | Entry list: "2026-11-23: 8 glasses"; progress became "1 of 3 days met" | Entry "D-2: 8 glasses"; progress "1 of 3 days met" | matches |
| 7 | Set Date=2026-11-24, Value=6, Save entry | Entry list: "2026-11-24: 6 glasses" above "2026-11-23: 8 glasses"; progress stayed "1 of 3 days met" | Entry "D-1: 6 glasses" plus earlier entry; progress stays "1 of 3 days met" | matches |
| 8 | Set Date=2026-11-25, Value=10, Save entry | Entry list: "2026-11-25: 10 glasses" at top, plus the two earlier entries; progress became "2 of 3 days met" | Entry "D: 10 glasses" with earlier entries; progress "2 of 3 days met" | matches |
| 9 | Reloaded page (F5) | Same goal, same three entries (10/6/8 glasses on 25th/24th/23rd), "2 of 3 days met" all still present after reload | Goal, three entries, and "2 of 3 days met" persist after reload | matches |
| 10 | Pressed "Log out", then browser Back | Logged out to login screen. Pressing Back briefly showed `/goals/new` in the address bar but the app immediately redirected to the login screen; no goals data was shown | Login screen shows again; Back does not show goals page with data (session gone) | matches |

### Evidence

| File | Step |
|---|---|
| UAT-01-step1.png | 1 |
| UAT-01-step2.png | 2 |
| UAT-01-step3.png | 3 |
| UAT-01-step4.png | 4 |
| UAT-01-step6.png | 6 |
| UAT-01-step7.png | 7 |
| UAT-01-step8.png | 8 |
| UAT-01-step9.png | 9 |
| UAT-01-step10.png | 10 |

(No screenshot for step 5 was taken as a separate file; the saved state is captured in step 6's screenshot, which shows the goal already created. Step 5's actual result above was read from the live page text at that point.)

### Issue ID if FAIL

N/A — no differences found.

## Suggested verdict

**suggested: PASS**

All 10 steps produced exactly their expected results; no differences were observed.

## Final verdict (tester-confirmed)

**PASS** — confirmed by asamapornch (warunwora gave his opinion on the results) after reviewing evidence screenshots for steps 8, 9 and 10.

## Cleanup / sequence note

After this run, P1 has an active goal on Water (target 8, 2026-11-23–2026-12-22) with 3 entries, per the case's own "leaves behind" note. UAT-02 (next case) uses M1 and P2 only, so this does not block it.
