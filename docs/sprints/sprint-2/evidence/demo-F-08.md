# F-08 Progress Summaries — local demo

Tested commit: `bab69151734bbe47eb4f44cb0b33e21f76c5d488` (`feature/f08-progress-summaries`).
Server run locally on `http://localhost:4001` (not the deployed Cloud Run app), same local setup as
`demo-F-06.md`. Continues from that demo's goal 1 (P1's goal, template "Demo Running" 0–50 km,
currently effective `dailyTarget` 8 after the revision recorded there).

## Setup — three entries recorded by P1

```
$ curl -s -b p1.jar -X POST http://localhost:4001/goals/1/entries -H "Content-Type: application/json" \
  -d '{"date":"2026-11-25","value":8}'
{"id":1,"goalId":1,"date":"2026-11-25","value":8}

$ curl -s -b p1.jar -X POST http://localhost:4001/goals/1/entries -H "Content-Type: application/json" \
  -d '{"date":"2026-11-26","value":3}'
{"id":2,"goalId":1,"date":"2026-11-26","value":3}

$ curl -s -b p1.jar -X POST http://localhost:4001/goals/1/entries -H "Content-Type: application/json" \
  -d '{"date":"2026-11-27","value":10}'
{"id":3,"goalId":1,"date":"2026-11-27","value":10}
```

## (i) AC-08.1/08.2/08.5: retrieval after the write, and persistence in the database

Role: P1 (goal owner). Starting condition: goal 1, effective `dailyTarget` 8, three entries just
recorded above (8 met, 3 not met, 10 met).

**Step 1 — GET /goals/1/summary, read back the computed figures over the saved entries:**

```
$ curl -s -b p1.jar http://localhost:4001/goals/1/summary
{"goalId":1,"week":{"start":"2026-11-23","end":"2026-11-27","daysRecorded":3,"daysMet":2,"total":21,"average":7},
 "month":{"start":"2026-11-01","end":"2026-11-27","daysRecorded":3,"daysMet":2,"total":21,"average":7}}
```
Expected: `daysRecorded` 3, `daysMet` 2 (8 and 10 meet target 8; 3 does not), `total` 21 (8+3+10),
`average` 7 (21÷3), for both windows (all three entries fall inside both the current ISO week and
the current month, which both end at `lastDay` = today = 2026-11-27). Actual: matches.

**Step 2 — persistence, queried directly against the database (not through the API):**

```
$ docker exec f06-test-pg psql -U habit -d habit_tracker -c \
  "SELECT id, \"goalId\", date, value FROM entries ORDER BY date;"
 id | goalId |    date    | value
----+--------+------------+-------
  1 |      1 | 2026-11-25 |     8
  2 |      1 | 2026-11-26 |     3
  3 |      1 | 2026-11-27 |    10
```
Expected: three rows matching what was posted. Actual: matches. (F-08 itself writes nothing — the
summary is computed fresh on each request, per the contract §2 "Other decisions" — so the persistence
being proven here is of the underlying entries it reads, not of the summary itself.)

## (ii) AC-08.8 / NFR-05: rule rejection

F-08 is a read-only endpoint with no request body, so its only own rejections are access/validation
ones (401/403/404, covered in (iii) below, and this 400):

```
$ curl -s -o resp.json -w "%{http_code}\n" -b p1.jar http://localhost:4001/goals/abc/summary
400
$ cat resp.json
{"error":{"code":"VALIDATION_ERROR","message":"Invalid goal id."}}
```
Expected: 400 `VALIDATION_ERROR` "Invalid goal id." for a malformed `:id`. Actual: matches.

(The more substantive cross-feature rule — AC-08.6, a revision changing which days count as "met"
partway through a window — is proven in the automated test TEST-08.6, not repeated live here, since
it needs two different "today"s to show a revision taking effect only from its own effective date
onward; see `test-excerpts.md`.)

## (iii) AC-08.7/08.9: forbidden role, another Participant's goal, and no session

```
$ curl -s -o resp.json -w "%{http_code}\n" -b manager.jar http://localhost:4001/goals/1/summary
403
$ cat resp.json
{"error":{"code":"FORBIDDEN","message":"You do not have permission to perform this action."}}

$ curl -s -o resp.json -w "%{http_code}\n" -b p2.jar http://localhost:4001/goals/1/summary
404
$ cat resp.json
{"error":{"code":"NOT_FOUND","message":"Goal not found."}}

$ curl -s -o resp.json -w "%{http_code}\n" http://localhost:4001/goals/1/summary
401
$ cat resp.json
{"error":{"code":"UNAUTHENTICATED","message":"Authentication required."}}
```
Expected: Manager 403, another Participant (P2) 404 (not 403 — role gate passed, ownership check
answers next), no session 401. Actual: all three match.

## UI

Tested commit: `cb98b7b` (feature/f08-progress-summaries). Captured with Playwright (Chromium,
headless) driving the real local app at `http://localhost:5173` against the real local backend at
`http://localhost:4001` — no mocks. Same screenshots as `demo-F-06.md` (the panel sits on the same
goal screen), in `docs/sprints/sprint-2/evidence/screenshots/`; referenced here for their F-08
content specifically.

**01-goal-screen-with-summary.png** (AC-08.10/08.11) — the "This week / this month" panel shows
"2026-11-23 to 2026-11-28" (week) and "2026-11-01 to 2026-11-28" (month) — note "today" had advanced
to 2026-11-28 by the time this UI pass was run (a day after the API-level demo above), so the window
end dates and the figures below differ slightly from the curl evidence further up this file: `3 days
recorded, 2 met, total 21, average 7` for both windows, over the same three entries (the one extra
day with no new entry between 11-27 and 11-28 changes nothing, per AC-08.4/08.1). This is the real,
live app re-computing the summary on the actual current date, not a stale fixture — backed by the
same `entries` table rows queried in (i) above, re-queried at this point in time:

```
$ docker exec f06-test-pg psql -U habit -d habit_tracker -c "SELECT count(*) FROM entries;"
 count
-------
     3
```
Expected: still exactly 3 entries (none added/removed by any UI action in this pass). Actual: matches.

**04-after-reload-persisted.png** (AC-08.15) — same screenshot as F-06's reload evidence: after
revising the target to 15 and reloading, the summary panel is still present and correct (the panel
refetches on its own `goal.id`/revision-refresh dependency, independent of the entries/progress
fetch, so it survives the reload exactly like the rest of the screen).

**05-manager-no-goals-section.png** (AC-08.14) — Manager has no path to any goal screen, so no path
to the summary panel either — consistent with the forbidden-role API evidence (iii) above.

No separate screenshot was taken for AC-08.12 (empty-window state) or AC-08.13 (summary-fetch error):
both are exercised and asserted in the automated UI tests (TEST-08.12, TEST-08.10b) with full DOM
snapshots in `F-08-ui-green-output.txt`'s underlying test run, rather than re-staged live — producing
a `daysRecorded: 0` window or a live network failure on demand would require tearing down the one
populated demo goal or killing the local server mid-session, which would undermine the rest of this
demo rather than add independent evidence.

## Review fix (v1.5): summary window uses the effective end date — AC-08.16

Review finding by warunwora on F-06 PR #76, extended to F-08. Tested commit: `7d6caf0`
(`feature/f08-progress-summaries`).

**Not demonstrated live, by design, and disclosed rather than worked around:** AC-08.16's visible
effect (the week/month window's `end` and `daysRecorded` reflecting an *extended* end date) only
differs from the old buggy behaviour once real time has advanced *past* the goal's original stored
end — the same structural limitation noted in `demo-F-06.md`'s review-fix section for AC-06.20/21/23.
Within a single live session the real clock cannot be advanced to create that gap, and (per D-24,
implemented in the same fix) a goal already past its own effective end can no longer be revised at
all, closing off any live workaround. This is proven instead by the automated test TEST-08.16
(fake timers, two distinct "today"s: one to create the goal and revise its end while it is still
active, a later one to fetch the summary), with its real `vitest` output in
`F-08-review-fix-green-output.txt` (passes); the real failing run before the fix, asserting the same
`month.end` and getting the stale stored end back instead, is in `F-08-review-fix-red-output.txt`.
