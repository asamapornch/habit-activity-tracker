# F-06 Goal Revisions — local demo

Tested commit: `bab69151734bbe47eb4f44cb0b33e21f76c5d488` (`feature/f08-progress-summaries`, which
includes all of F-06). Server run locally on `http://localhost:4001` (not the deployed Cloud Run app),
built from this worktree's own `.env` (local/synthetic, throwaway passwords, Postgres on
`localhost:55432` in a throwaway Docker container). Accounts: `manager@example.com` (Manager),
`participant1@example.com` (P1), `participant2@example.com` (P2), all seeded with the same throwaway
local password.

## Setup

1. Logged in as Manager, Participant1 (P1) and Participant2 (P2) — three separate cookie jars.
2. Manager created template id 1 ("Demo Running", km, 0–50).
3. P1 created goal id 1 on that template: `dailyTarget` 5, `startDate` 2026-11-01, `endDate`
   2026-12-31.

```
$ curl -s -b manager.jar -X POST http://localhost:4001/templates -H "Content-Type: application/json" \
  -d '{"name":"Demo Running","unit":"km","minValue":0,"maxValue":50}'
{"id":1,"name":"Demo Running","unit":"km","minValue":0,"maxValue":50,"backdateDays":null,"createdById":1}

$ curl -s -b p1.jar -X POST http://localhost:4001/goals -H "Content-Type: application/json" \
  -d '{"templateId":1,"dailyTarget":5,"startDate":"2026-11-01","endDate":"2026-12-31"}'
{"id":1,"userId":2,"templateId":1,"dailyTarget":5,"startDate":"2026-11-01","endDate":"2026-12-31"}
```

## (i) AC-06.1 / AC-06.10: revise, read back, and persistence in the database

Role: P1 (goal owner). Starting condition: goal 1, `dailyTarget` 5, no revisions yet.

**Step 1 — PATCH /goals/1, revise dailyTarget 5 -> 8:**

```
$ curl -s -b p1.jar -X PATCH http://localhost:4001/goals/1 -H "Content-Type: application/json" \
  -d '{"dailyTarget":8}'
```
Expected: 200, `dailyTarget` 8, `endDate` unchanged.
Actual: `{"id":1,"userId":2,"templateId":1,"dailyTarget":8,"startDate":"2026-11-01","endDate":"2026-12-31"}` — matches.

**Step 2 — GET /goals/1 and GET /goals, read back the saved write:**

```
$ curl -s -b p1.jar http://localhost:4001/goals/1
{"id":1,"userId":2,"templateId":1,"dailyTarget":8,"startDate":"2026-11-01","endDate":"2026-12-31"}

$ curl -s -b p1.jar http://localhost:4001/goals
[{"id":1,"userId":2,"templateId":1,"dailyTarget":8,"startDate":"2026-11-01","endDate":"2026-12-31"}]
```
Expected: both show the currently effective `dailyTarget` 8. Actual: matches.

**Step 3 — persistence, queried directly against the database (not through the API):**

```
$ docker exec f06-test-pg psql -U habit -d habit_tracker -c \
  "SELECT id, \"goalId\", \"dailyTarget\", \"endDate\", \"effectiveFrom\" FROM goal_revisions;"
 id | goalId | dailyTarget |  endDate   | effectiveFrom
----+--------+-------------+------------+---------------
  1 |      1 |           8 | 2026-12-31 | 2026-11-27
```
Expected: one `goal_revisions` row, `effectiveFrom` = today (2026-11-27, the date this demo was run,
Asia/Bangkok). Actual: matches.

## (ii) AC-06.7 / BR-10: a meaningful rule rejection

Role: P1. Starting condition: same goal 1 (template range 0–50).

```
$ curl -s -o resp.json -w "%{http_code}\n" -b p1.jar -X PATCH http://localhost:4001/goals/1 \
  -H "Content-Type: application/json" -d '{"dailyTarget":51}'
400
$ cat resp.json
{"error":{"code":"VALIDATION_ERROR","message":"Daily target must be within the template range."}}
```
Expected: 400 `VALIDATION_ERROR` "Daily target must be within the template range.", nothing stored.
Actual: matches. Confirmed nothing stored: `goal_revisions` row count stayed at 1 (checked by the
same query as above, re-run after this request).

## (iii) AC-06.4 / AC-06.6: forbidden role and another Participant's goal

**Manager (forbidden role):**
```
$ curl -s -o resp.json -w "%{http_code}\n" -b manager.jar -X PATCH http://localhost:4001/goals/1 \
  -H "Content-Type: application/json" -d '{"dailyTarget":8}'
403
$ cat resp.json
{"error":{"code":"FORBIDDEN","message":"You do not have permission to perform this action."}}
```
Expected: 403 `FORBIDDEN`. Actual: matches.

**P2 (another Participant's goal):**
```
$ curl -s -o resp.json -w "%{http_code}\n" -b p2.jar -X PATCH http://localhost:4001/goals/1 \
  -H "Content-Type: application/json" -d '{"dailyTarget":8}'
404
$ cat resp.json
{"error":{"code":"NOT_FOUND","message":"Goal not found."}}
```
Expected: 404 `NOT_FOUND` (not 403 — ownership is checked after the role gate but the response does not
reveal that the goal exists). Actual: matches. `goal_revisions` row count stayed at 1 after both.

## UI

Tested commit: `55b2003` (feature/f06-goal-revisions) for the Revise control; reran against
`cb98b7b` (feature/f08-progress-summaries) for the combined screenshots below, since the summary
panel (F-08) sits on the same goal screen. Captured with Playwright (Chromium, headless) driving the
real local app at `http://localhost:5173` (frontend dev server) against the real local backend at
`http://localhost:4001` — no mocks, same seeded accounts as above. Screenshots in
`docs/sprints/sprint-2/evidence/screenshots/`.

**01-goal-screen-with-summary.png** — P1 opens "Demo Running" goal: header shows the currently
effective target (8, from the earlier API-level revision), the "Revise goal" control is present.

**02-revise-form-prefilled.png** (AC-06.14) — clicking "Revise goal" opens a form prefilled with the
currently effective `dailyTarget` (8) and `endDate` (2026-12-31) — matches `GET /goals/1` at the time.

**03-revise-rejection.png** (AC-06.16 / BR-10) — typed `999` into Daily target and submitted; the
form shows "Daily target must be within the template range." verbatim and stays open with `999` still
in the field — same rejection as the API-level evidence above (ii), now shown in the UI.

**04-after-reload-persisted.png** (AC-06.15 / persistence) — revised the target to `15` (an actual
change from 8); the screen updated immediately from the PATCH response (no extra request); the page
was then reloaded (full browser reload, not a client-side route change — this SPA has no routing, so
a reload returns to the goals list and the goal was re-opened) and still shows "15 km a day", proving
the value is read back from the server/database, not just held in React state. Backed by direct
database and API evidence, captured at the same point:

```
$ docker exec f06-test-pg psql -U habit -d habit_tracker -c \
  "SELECT id, \"goalId\", \"dailyTarget\", \"effectiveFrom\" FROM goal_revisions ORDER BY id;"
 id | goalId | dailyTarget | effectiveFrom
----+--------+-------------+---------------
  1 |      1 |           8 | 2026-11-27
  2 |      1 |          12 | 2026-11-28
  3 |      1 |          15 | 2026-11-28
(3 rows)

$ curl -s -b p1fresh.jar http://localhost:4001/goals/1
{"id":1,"userId":2,"templateId":1,"dailyTarget":15,"startDate":"2026-11-01","endDate":"2026-12-31"}
```
Expected: the highest-id revision for 2026-11-28 (id 3, target 15) is the one in effect (D-14
tie-break — two revisions share `effectiveFrom` 2026-11-28 from this demo session's own work).
Actual: matches, both at the database and through a freshly-logged-in cookie (not a cached session).

**05-manager-no-goals-section.png** (AC-06.19) — Manager logs in and sees only the Templates screen;
no Goals section, no path to a goal screen, so no path to the Revise control either — consistent with
the forbidden-role API evidence above (iii).
