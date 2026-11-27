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

Not applicable: F-06's contract §3.3 explicitly leaves the UI unbuilt in this contract ("Sprint 2
implementation phase adds it to the goal screen"). No screenshots to take — there is no new UI for
this feature yet.
