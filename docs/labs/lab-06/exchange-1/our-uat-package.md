# Lab 6 – Exchange 1: UAT package from Team "Habit and Activity Tracker"

Product team: Asamaporn Chayanuntasakul (asamapornch) and Warun (warunwora)
Package version: 1.0 · Date: 23 Nov 2026

## Part 1 – Handoff

| Item | Value |
| --- | --- |
| Product | Habit and Activity Tracker (recording system only; no medical advice, no reminders delivered) |
| Repository | https://github.com/asamapornch/habit-activity-tracker |
| Release tag | `v1.0-sprint1` (Sprint 1 features F-01 to F-05) |
| Version under test | `main` at commit `0619c07db872a5bf1c7946301b4bfc40e9e477d2` (contains the tag; later commits only add Docker, CI and deployment files, no feature change) |
| Deployed revision | Cloud Run revision `s65da36e2-00009-b4s`, image from Deploy demo run #6 (https://github.com/asamapornch/habit-activity-tracker/actions/runs/44890478696) |
| URL | https://s65da36e2-4d7hbszvwq-as.a.run.app |
| In scope | Login/logout, activity templates (create, edit, list), goals (create, list, open), daily entries, history, progress %, role and ownership rules |
| Out of scope | Goal revision, streaks, weekly/monthly summaries, reminders (Sprints 2–3); self-registration; password recovery; sharing history |
| Requirements | `docs/srs.md` (FR-01..09, BR-01..09). Acceptance criteria: `docs/sprints/sprint-1/F-01..F-05` |

If the revision above is replaced before you start, we will tell you the new revision in writing and re-state which cases are affected.

### Accounts (seeded)

| Label | Email | Role |
| --- | --- | --- |
| MANAGER | manager@example.com | Manager |
| P1 | participant1@example.com | Participant |
| P2 | participant2@example.com | Participant |

Passwords are NOT in this document. We will send them to your tester privately (direct message). Do not copy them into screenshots, reports or Git.

### Data setup, reset and cleanup

- The database starts with the three accounts and **no templates and no goals** (unless a previous tester left data).
- The system has no delete function, so data cannot be reset from the UI. To keep cases independent, every case uses its **own template** with the name prefix `UAT-<case id>-<your initials>` (e.g. `UAT-02-AB`). A goal belongs to one template, so goals of different cases never overlap (BR-04).
- Dates are relative to **today** (Asia/Bangkok date, shown on the goal screen). Write the real dates you used in the result sheet. Format `YYYY-MM-DD`.
- A date can be used only once per goal, so each case must be run once per template. To repeat a case, create a new template with a new name.
- Use only synthetic data. Do not enter real personal information.

### Case sequence and independence

UAT-01 first (it checks the screens are reachable); UAT-02 to UAT-05 are independent of each other and can run in any order. UAT-06 should run last. A failed case does not block the others except where marked.

## Part 2 – UAT cases

Notation: *T* = today's date, *T-2* = two days before today, *T+1* = tomorrow.

### UAT-01 – Normal journey: template → goal → entry → progress (FR-01, FR-03, FR-05, FR-06, FR-07, FR-08, FR-09; AC-01.x login, AC-02.1, AC-03.1, AC-03.15, AC-03.17, AC-04.1, AC-04.18, AC-04.20)

Category: normal journey. Depends on: none.
Preconditions: browser with no active session. Account MANAGER and P1.
Test data: template `UAT-01-<initials>`, unit `km`, min `0`, max `20`. Goal: daily target `5`, start *T-2*, end *T+5*. Entry: date *T*, value `6`.

1. Open the URL. Sign in as MANAGER.
2. In **Templates**, use **Create template** with the data above and submit.
3. Sign out. Sign in as P1.
4. In **Goals → Create goal**, choose the template from step 2, daily target 5, start *T-2*, end *T+5*, submit.
5. Open the new goal from the list.
6. In **Record entry**, date *T* (prefilled), value 6, submit.

Expected:
- Step 2: template appears in the list with name, unit km, 0 and 20.
- Step 4: the goal appears in P1's list with the template name, target 5 km and both dates.
- Step 5: history shows an empty-history message; progress is 0 %.
- Step 6: the entry (date *T*, value 6) appears in the history; progress shows 1 day met of 3 days elapsed = **33.33 %**.

### UAT-02 – Business rules on entries (BR-01, BR-02, BR-03; AC-04.6, AC-04.7, AC-04.9, AC-04.10, AC-04.21)

Category: business rule / boundary. Depends on: none.
Preconditions: signed in as P1; MANAGER has created template `UAT-02-<initials>`, unit `pages`, min `1`, max `50`. P1 has a goal on it: target `10`, start *T-3*, end *T+3*.
Actions (each on the goal screen, **Record entry**):

1. Date *T*, value `10` → submit.
2. Same date *T*, value `12` → submit.
3. Date *T-1*, value `51` → submit.
4. Date *T-1*, value `50` → submit.
5. Date *T+1*, value `10` → submit.
6. Date *T-4* (before start), value `10` → submit.
7. Date *T-2*, value `0` → submit.
8. Date *T-2*, value `10.555` → submit.

Expected:
- 1: accepted; entry appears.
- 2: rejected with a conflict message (an entry already exists for this date); the first entry (10) is unchanged; typed values stay in the form.
- 3: rejected, message that the value must be within the template range; nothing added.
- 4: accepted (maximum is inclusive).
- 5: rejected, message that the date must not be in the future.
- 6: rejected, message that the date must be within the goal's start and end dates.
- 7: rejected (below minimum 1).
- 8: rejected as invalid (more than two decimals).
- History lists exactly 2 entries (*T-1* = 50, *T* = 10), in date order; progress = 50.00 % (see note below).

Note for the tester: days met counts days with a value at or above the target 10. *T-1* (50) and *T* (10) are met, so daysMet = 2, daysElapsed = 4 (start *T-3* to today, both ends counted), progress = **50.00 %**.

### UAT-03 – Business rules on goals (BR-04, BR-05; AC-03.5, AC-03.7, AC-03.8, AC-03.9, AC-03.18)

Category: business rule / boundary. Depends on: none.
Preconditions: MANAGER has created template `UAT-03-<initials>`, unit `min`, min `0`, max `120`; second template `UAT-03b-<initials>`, min `0`, max `10`. Signed in as P1.
Actions (**Create goal**):

1. Template UAT-03, target `30`, start *T*, end *T+10* → submit.
2. Template UAT-03, target `30`, start *T+5*, end *T+15* (overlaps) → submit.
3. Template UAT-03, target `30`, start *T+10*, end *T+12* (shares only the last day) → submit.
4. Template UAT-03, target `30`, start *T+11*, end *T+20* (no overlap) → submit.
5. Template UAT-03, target `30`, start *T+30*, end *T+25* → submit.
6. Template UAT-03, target `121`, start *T+40*, end *T+41* → submit.
7. Template UAT-03, target `120`, start *T+40*, end *T+40* → submit.
8. Template UAT-03b, target `5`, start *T*, end *T+10* (same dates, other template) → submit.

Expected:
- 1: accepted.
- 2: rejected with a conflict message; goal list unchanged; form keeps typed values.
- 3: rejected (inclusive dates overlap on *T+10*).
- 4: accepted.
- 5: rejected, message that end date must not be before start date.
- 6: rejected, message that the daily target must be within the template range.
- 7: accepted (target equals maximum; start equals end is allowed).
- 8: accepted (different template).
- Final P1 list has exactly 4 new goals (steps 1, 4, 7, 8).

### UAT-04 – Forbidden role (BR-06, BR-08, FR-03; AC-02.2, AC-03.16, AC-03.3, AC-05.2, AC-05.3)

Category: forbidden role. Depends on: none.
Preconditions: none (use templates from other cases if present).
Actions:

1. Sign in as P1. Look at the page sections.
2. Sign out. Sign in as MANAGER. Look at the page sections.
3. As MANAGER, use **Edit** on any template, change the max value, save. Then reload the page.
4. *Optional API check (technical tester):* while signed in as P1, in the browser developer console run
   `fetch('<URL>/templates', {method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name:'x',unit:'u',minValue:0,maxValue:1})}).then(r=>r.status)`.
   (If the console says the API lives on another path, use the address the browser's Network tab shows for template requests.) Repeat as MANAGER with `fetch('<API>/goals', {credentials:'include'}).then(r=>r.status)`.

Expected:
- 1: P1 sees Templates (read-only: no Create template form, no Edit buttons) and Goals.
- 2: MANAGER sees Templates with Create template and Edit, and does **not** see a Goals section.
- 3: the new maximum is shown after reload; the template name and unit are unchanged.
- 4: P1's POST /templates returns **403** and no template is created; MANAGER's GET /goals returns **403**. A request with no session returns **401**.

### UAT-05 – Ownership and privacy (BR-08, FR-09; AC-03.11, AC-03.12, AC-05.4, AC-05.5, AC-05.6, AC-05.7)

Category: forbidden ownership. Depends on: none.
Preconditions: MANAGER created template `UAT-05-<initials>` (unit `cups`, 0–10). P1 created a goal on it (target 3, start *T-1*, end *T+5*) and recorded one entry (date *T*, value 4). P2 has no goal on this template.
Actions:

1. Sign in as P2. Open the Goals list.
2. As P2, create their own goal on the same template with the **same dates and target**.
3. As P2, open that goal and record date *T*, value 2.
4. Sign in as P1 again. Open the Goals list and open their goal from the preconditions.
5. *Optional API check:* as P2, note P1's goal id (P1 sees it via the Network tab of the goals request) and call `GET <API>/goals/<P1 goal id>`, `GET <API>/goals/<P1 goal id>/entries`, `GET <API>/goals/<P1 goal id>/progress`, and `GET <API>/goals/999999`.

Expected:
- 1: P2's list does **not** contain P1's goal (empty).
- 2: accepted (BR-04 applies per participant, not across participants).
- 3: accepted; P2's history shows only their own entry (2), progress 1 day of 2 elapsed → target 3 not met → 0 met of 2 = **0.00 %**.
- 4: P1 still sees only their own goal, with the entry value 4 (not changed by P2); progress 1 met of 2 = **50.00 %**.
- 5: all four calls return **404** with the same message (P1's goal is not revealed to P2 and looks the same as a non-existent id).

### UAT-06 – Session, logout and persistence (FR-01, FR-02, NFR-01; AC-01.x, AC-03.19, AC-04.22)

Category: state / history / persistence. Depends on: data from UAT-01 or UAT-05 (P1 has a goal with an entry).
Actions:

1. Open the URL, try to sign in as P1 with a **wrong** password; then try an unknown email with any password.
2. Sign in as P1 with the correct password.
3. Reload the page (F5).
4. Open the goal that has an entry; note history and progress.
5. Sign out. Press the browser Back button.
6. Sign in as P1 again and open the same goal.

Expected:
- 1: both attempts show the **same** generic "invalid credentials" style message (the system must not reveal which part was wrong); no session starts.
- 3: P1 is still signed in (session lasts 8 hours).
- 4/6: the same entries and the same progress are shown before and after sign-out and sign-in (data persisted).
- 5: after sign-out the sign-in screen is shown; Back does not show P1's data; a request that returns 401 sends the user to the sign-in screen.

## Part 3 – Result sheet (for the UAT team to fill in)

| Case | Tester | Date | Version tested (revision) | Result (PASS / FAIL / BLOCKED) | Evidence (screenshot name) | Defect ID |
| --- | --- | --- | --- | --- | --- | --- |
| UAT-01 | | | | | | |
| UAT-02 | | | | | | |
| UAT-03 | | | | | | |
| UAT-04 | | | | | | |
| UAT-05 | | | | | | |
| UAT-06 | | | | | | |

### Defect report format (please use for every FAIL)

Defect ID · Case ID · Title · Version/revision · Account/role · Steps to reproduce (numbered) · Expected result · Actual result · Evidence (screenshot or response status) · Severity (critical / major / minor / cosmetic, with one line of reason) · Date and tester.
Please do not include passwords or tokens in the report.

## Part 4 – What happens next

1. Please return your result sheet and defect reports to us (target: [date to be agreed]).
2. We will triage each report as accepted defect / duplicate / not a defect / enhancement, with a reason, and tell you within the agreed time.
3. Accepted critical or major defects will be fixed with a failing test first, reviewed, released and redeployed; we will send the new revision for you to retest.
4. Only your team signs the acceptance decision. We will not mark any case PASS for you.

## Part 5 – Optional prompt for your AI assistant

You may use an AI assistant (for example Claude Code or a chat assistant) to help you run these cases and write the reports. The tester must still run the steps in a browser and decide PASS/FAIL personally. Please declare the AI use in your Lab 6 PDF. Copy everything between the lines into your AI tool, together with this file.

---
You are helping me act as the UAT tester for the web app described in the attached file `lab6-exchange1-package.md` (Habit and Activity Tracker, Sprint 1).

Rules:
1. Do not invent results. I will run each step in the browser myself and tell you what I saw (status, message text, numbers). Only I decide PASS, FAIL or BLOCKED. If I have not given you an observation, mark the case as "not run".
2. Never ask for, store or print passwords or tokens. If I paste one by mistake, tell me to stop and report it to the product team so it can be changed.
3. Walk me through ONE case at a time: show the preconditions, the exact test data with real dates (today is <write today's date, Asia/Bangkok>), then the numbered steps one by one, and wait for my observation before the next step.
4. After each step, compare my observation with the expected result in the file and say "matches" or "differs" with the exact difference. Do not guess the cause in the code.
5. For every difference, help me write a defect report with these fields: Defect ID, Case ID, Title, Version/revision, Account/role, Steps to reproduce, Expected, Actual, Evidence, Severity (critical/major/minor/cosmetic with one line of reason), Date and tester. Keep Expected and Actual factual and separate. Do not propose fixes unless I ask.
6. If an expected result in the file looks wrong or unclear (for example it contradicts the app's visible behaviour or the requirement it cites), say so clearly and mark it "case unclear" instead of failing the app.
7. At the end, fill the result sheet (Part 3 of the file) from my observations only, and list the cases not run.
Start with UAT-01.
---
