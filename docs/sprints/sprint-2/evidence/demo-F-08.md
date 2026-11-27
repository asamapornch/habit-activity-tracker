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

Not applicable: F-08's contract §3.3 explicitly leaves the UI unbuilt in this contract. No
screenshots to take.
