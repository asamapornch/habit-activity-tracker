# UAT-03 Forbidden role and ownership — Result record

## Preconditions check

| # | Precondition | Result |
|---|---|---|
| 1 | Deployed release/URL named in handoff | `build 50f5605` shown again — matches. |
| 2 | Template Walking exists (steps, 0–20000) | Confirmed on Templates pages throughout (P1's B1, M1's C1): "Walking, steps, 0–20000". |
| 3 | P2 and P1 have no goal on Walking; no template "UAT-03 Probe" | Confirmed: before Part S, P2's goals were UAT-02 Squats/Water/Reading only; P1's was Water only (from UAT-01); no Walking goal for either; no "UAT-03 Probe" row. |
| 4 | Today = D | D = 2026-11-25 (Asia/Bangkok). |
| 5 | Parts run in order S, A, B, C, D, same sitting, finished before 24:00 | Done. |
| 6 | Console helper | Console steps were executed as equivalent `fetch()` calls run directly in the page context (via automation), per the task's instruction to run "the same fetch calls, same paths" rather than the literal browser DevTools console. Status + body recorded verbatim for each. |

## Result record

| Field | Entry |
|---|---|
| Tester name and team | Asamaporn Chayanuntasakul (asamapornch) and warunwora, team Habit and Activity Tracker. Both team members sat together during the session. The browser steps were run by Claude Code (AI agent) under their direct supervision. warunwora gave his opinion on the UAT results during the session. |
| Date and time | 2026-11-25, approx. 14:22-14:36, derived from evidence file modification times; not a stopwatch record, Asia/Bangkok |
| Tested version | `build 50f5605` |
| Real date used for D | 2026-11-25 |
| `<G>` (Walking goal id, from S4) | 6 |
| `<P2>` (P2's user id, from S4) | 3 |

### Actual result per step

**Part S — set up P2's private goal (P2)**

| Step | Actual result | Compare |
|---|---|---|
| S1 | Goals page opened | matches |
| S2 | Goal listed: Walking, "Daily target: 5000 steps", 2026-11-25–2026-12-01, Active, "0 of 1 days met" | matches |
| S3 | Entry "2026-11-25: 6000 steps"; progress "1 of 1 days met" | matches |
| S4 | First command printed `[6]` → `<G>`=6. Second printed `3` → `<P2>`=3 | matches |
| S5 | Logged out; login screen shown | matches |

**Part A — another Participant cannot see/change P2's records (P1)**

| Step | Actual result | Compare |
|---|---|---|
| A1 | Goals page opened | matches |
| A2 | Only P1's own Water goal listed; no Walking goal, no "5000 steps"/"6000 steps" text | matches |
| A3 | `200 {"goals":[{"id":2,...,"template":{"name":"Water",...}}]}` — no Walking goal, no id 6 | matches |
| A4 | `404 {"error":{"code":"GOAL_NOT_FOUND","message":"Goal not found."}}` | matches |
| A5 | Same `404 GOAL_NOT_FOUND` for POST attempt | matches |
| A6 | Goal 999999: identical `404 GOAL_NOT_FOUND` for both GET and POST — indistinguishable from A4/A5 | matches |
| A7 | `201`, goal created with `templateId: 2` (Walking); `participantId: 3` in the body was ignored | matches |
| A8 | Reload: P1's goals page now lists a Walking goal ("Daily target: 5000 steps", 2026-11-25–2026-11-25, Active) — P1's own goal | matches |
| A9 | P2's Walking goal: entry list still only "2026-11-25: 6000 steps" (P1's attempted value 1 not stored); progress "1 of 1 days met"; no second Walking goal | matches |
| A10 | Logged out; login screen shown | matches |

**Part B — Participant cannot create/edit a template (P1)**

| Step | Actual result | Compare |
|---|---|---|
| B1 | Read-only table (Name/Unit/Range only, no Edit/State/New); Walking `0–20000` | matches |
| B2 | `/templates/new`: "This page is not available for your role." No form | matches |
| B3 | `403 {"error":{"code":"FORBIDDEN","message":"You do not have permission to do this."}}` — role field and X-Role header had no effect | matches |
| B4 | Walking template id `W` = 2 | matches |
| B5 | `/templates/2/edit`: "This page is not available for your role." No form | matches |
| B6 | Both PATCH on id 2 and id 999999: identical `403 FORBIDDEN` | matches |
| B7 | No "UAT-03 Probe" row; Walking still `0–20000` | matches |
| B8 | Logged out; login screen shown | matches |

**Part C — Manager refused every goal/entry operation (M1)**

| Step | Actual result | Compare |
|---|---|---|
| C1 | Templates page; menu "Templates" only, no "Goals" item; no "UAT-03 Probe" row | matches |
| C2 | `/goals`: "This page is not available for your role." No goal data | matches |
| C3 | `403 FORBIDDEN` — no goal list | matches |
| C4 | `403 FORBIDDEN` on empty-body POST — not a 400, role refused first | matches |
| C5 | Both GET and POST on goal 6 entries: identical `403 FORBIDDEN` (not 404 — role refused, existence not disclosed) | matches |
| C6 | P2's Walking goal unaffected: entry list still only "2026-11-25: 6000 steps", progress "1 of 1 days met" | matches |

**Part D — anonymous visitor (no session)**

| Step | Actual result | Compare |
|---|---|---|
| D1 | `/goals` with no session: redirected to login screen, no data shown | matches |
| D2 | `401 {"error":{"code":"UNAUTHENTICATED","message":"Please log in."}}` | matches |
| D3 | Same `401 UNAUTHENTICATED` for POST entry attempt — not 404, session checked first | matches |
| D4 | Same `401 UNAUTHENTICATED` for GET templates | matches |
| D5 | P2's Walking goal: still only "2026-11-25: 6000 steps" | matches |

### Evidence

Screenshots `UAT-03-S2.png`, `S3.png`, `A2.png`, `A8.png`, `A9.png`, `B1.png`, `B2.png`, `B5.png`, `B7.png`, `C1.png`, `C2.png`, `C6.png`, `D1.png` (image withheld from the repository because it showed a masked password field; the step result is recorded in the text above), `D5.png` in `~/uat-work/results/evidence/`. Console-step results above are the exact status/body text printed by each request (run as equivalent `fetch()` calls in the page context).

`UAT-03-A2.png` (same screenshot as `UAT-01-step9.png`; one screen supports several steps). `UAT-03-A9.png` (same screenshot as `UAT-03-C6.png`, `UAT-03-D5.png`; one screen supports several steps). `UAT-03-B2.png` (same screenshot as `UAT-03-B5.png`; one screen supports several steps). `UAT-03-B5.png` (same screenshot as `UAT-03-B2.png`; one screen supports several steps). `UAT-03-C1.png` (same screenshot as `UAT-02-A4.png`, `UAT-04-A1.png`; one screen supports several steps). `UAT-03-C6.png` (same screenshot as `UAT-03-A9.png`, `UAT-03-D5.png`; one screen supports several steps). `UAT-03-D5.png` (same screenshot as `UAT-03-A9.png`, `UAT-03-C6.png`; one screen supports several steps).

### Notes

- Step B3 (role-spoofing POST with `X-Role: MANAGER` header) required a one-time explicit user approval to run, since it was flagged by the harness's safety classifier as looking like an unauthorized-access attempt. The user approved this single request as part of the authorized UAT-03 case; it was not re-used or extended to any other request.
- During Part C, two login attempts (for M1, then for P2) initially failed with "Username or password is incorrect," requiring the user to retype the password. Also, two of my own verification checks were read before the page had finished re-rendering (a timing race in my own tooling), briefly showing stale session text; re-checking after a short wait confirmed the correct state each time. Neither affected the actual application behavior being tested.

### Issue ID if FAIL

N/A — no application differences found.

## Suggested verdict

**suggested: PASS**

Every step in Parts S, A, B, C and D produced its expected result: each forbidden request was refused with the exact status and message shown, no refused request stored anything (checked in A9, B7, C6, D5), and no refusal disclosed another account's data.

## Final verdict (tester-confirmed)

**PASS** — confirmed by asamapornch (warunwora gave his opinion on the results) after reviewing the A8/A9 screenshots and the verbatim console outputs for A4–A6, B3, B6, C3–C5, D2–D4.

## Cleanup / sequence note

After this case: P2 has an active Walking goal with one entry (6000 steps); P1 has one Walking goal (made via A7, 2026-11-25–2026-11-25, no entries). The refused requests stored no template and no entry. Per the handoff, the Product Team resets the Walking goals of P1 and P2 before UAT-03 is run again.
