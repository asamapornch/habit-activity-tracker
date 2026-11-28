#!/usr/bin/env python3
"""Smoke test for a deployed Habit Tracker service.

Called by .github/workflows/deploy.yml after every deploy:

    python3 deploy/smoke_test.py "$SERVICE_URL"

Checks, in order:
  1. GET /health                -> 200 {"status": "ok"}        (process is up)
  2. GET /ready                 -> 200 {"status": "ready"}     (database reachable)
  3. GET /                      -> 200 HTML                    (frontend is built in)
  4. GET /health/__smoke_404__  -> 404 JSON error NOT_FOUND    (unknown API path
     gets the API's JSON 404, not index.html; our routes have no /api prefix,
     see backend/src/lib/staticFrontend.ts)
  5. Optional login: POST /auth/login, GET /auth/me with the session cookie,
     then POST /auth/logout so no session row is left behind. Runs only when
     BOTH SMOKE_EMAIL and SMOKE_PASSWORD are set; skipped (not failed) when
     neither is set. The password is never printed.
  6. Optional Sprint 2/3 feature journey (Issue #99), gated on the same
     SMOKE_EMAIL/SMOKE_PASSWORD (participant 1). Uses its own fresh login,
     independent of check 5, so changing/removing check 5 would not affect
     this. One minimal path per feature:
       - F-06: PATCH a goal's dailyTarget/endDate, read back the effective
         value immediately and through a brand-new login session; a rule
         violation (target outside the template range) is rejected 400
         VALIDATION_ERROR with the contract's exact message.
       - F-07: GET streaks for that goal, check currentStreak/longestStreak.
       - F-08: GET summary for that goal, check the week/month window values.
       - F-09: PUT/GET/DELETE the goal's reminder schedule, confirm 204 and
         that a GET afterwards is 404 (gone).
       - Persistence across releases: reads back the Lab 7 synthetic fixture
         (template id 12 "L7-CHECK-1795726831", goal id 12, entries on
         2026-11-17/25/27 - see docs/labs/lab-07/evidence/
         post-deploy-check-output.txt) - proves pre-Sprint-2 data survived
         this release's two additive migrations.
     Needs an existing template whose name starts with "L7-CHECK" (created
     once, by Lab 7's own post-deploy check, as a Manager - this script logs
     in only as Participant accounts, so it cannot create one itself). If no
     such template is found, the whole feature journey is SKIPPED, never
     reported as a FAIL, and said so explicitly.
  7. Optional access-restriction checks, gated on a SECOND account
     (SMOKE_EMAIL_2/SMOKE_PASSWORD_2, participant 2): that account cannot
     read or modify participant 1's goal or reminder from check 6 (exact
     status/code per the contracts: 404 NOT_FOUND for a goal that is not
     theirs, same for its reminder sub-resource). SKIPPED (not failed) when
     either of the pair is unset, or when check 6 itself was skipped (no
     goal to test access to).

Known leftover limitation (documented here per Issue #99, not worked around):
no DELETE endpoint exists for templates/goals/entries, so the one goal and
one entry check 6 creates are left in the database after every run; only the
reminder schedule is cleaned up (it has its own DELETE). Re-running this
script the same day, or on a later day, reuses the same leftover goal
instead of creating another one (it looks for a goal on the L7-CHECK
template, other than goal 12 itself, owned by participant 1) and treats a
409 on the one-per-day entry POST as already-present rather than a failure,
so repeated runs do not pile up new leftover rows.

Retries: only failures that can clear up while a new Cloud Run revision starts
(connection errors, timeouts, HTTP 5xx such as /ready 503) are retried, and
only until SMOKE_MAX_WAIT_SECONDS (default 120) after the run started; after
that each check gets one attempt. A 4xx or a wrong body fails at once. The
feature journey (6) and access checks (7) are not retried this way - they run
once, after the core checks (1-4) have already established the service is up.
Exits 0 when every check passes, 1 on any failure, 2 on bad usage.
Standard library only.
"""

from __future__ import annotations

import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Callable
from zoneinfo import ZoneInfo

MAX_WAIT_SECONDS = float(os.environ.get("SMOKE_MAX_WAIT_SECONDS", "120"))
DELAY_SECONDS = float(os.environ.get("SMOKE_DELAY_SECONDS", "6"))
TIMEOUT_SECONDS = 10
USER_AGENT = "habit-tracker-smoke-test"
BANGKOK = ZoneInfo("Asia/Bangkok")
L7_TEMPLATE_PREFIX = "L7-CHECK"
# Default is the real deployed fixture's goal id (docs/labs/lab-07/evidence/
# post-deploy-check-output.txt). Overridable for local verification, where a
# fresh database would not have a goal at that same id.
L7_FIXTURE_GOAL_ID = int(os.environ.get("SMOKE_L7_GOAL_ID", "12"))
L7_FIXTURE_ENTRY_DATES = ("2026-11-17", "2026-11-25", "2026-11-27")


class CheckFailed(Exception):
    """A definite failure (4xx, wrong body): retrying will not help."""


class Transient(CheckFailed):
    """Service not up yet (connection error, timeout, 5xx): worth retrying."""


class Response:
    def __init__(self, status: int, headers, body: bytes):
        self.status = status
        self.headers = headers
        self.body = body

    @property
    def content_type(self) -> str:
        return (self.headers.get("Content-Type") or "").lower()

    def json(self):
        try:
            return json.loads(self.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise CheckFailed(f"expected JSON, got {self.content_type or 'no content type'}")

    def json_object(self) -> dict:
        body = self.json()
        if not isinstance(body, dict):
            raise CheckFailed(f"expected a JSON object, got {type(body).__name__}")
        return body


def request(base: str, method: str, path: str, data: dict | None = None,
            cookie: str | None = None) -> Response:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/html"}
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            return Response(res.status, res.headers, res.read())
    except urllib.error.HTTPError as err:
        # 4xx/5xx still carry a response we want to inspect.
        return Response(err.code, err.headers, err.read())
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        reason = getattr(err, "reason", err)
        raise Transient(f"request failed: {reason}")


def expect_status(res: Response, status: int) -> None:
    if res.status == status:
        return
    if res.status >= 500:
        raise Transient(f"expected HTTP {status}, got {res.status}")
    raise CheckFailed(f"expected HTTP {status}, got {res.status}")


def check_health(base: str) -> str:
    res = request(base, "GET", "/health")
    expect_status(res, 200)
    if res.json() != {"status": "ok"}:
        raise CheckFailed(f"unexpected body {res.json()!r}")
    return "200 ok"


def check_ready(base: str) -> str:
    res = request(base, "GET", "/ready")
    expect_status(res, 200)
    if res.json() != {"status": "ready"}:
        raise CheckFailed(f"unexpected body {res.json()!r}")
    return "200 ready (database reachable)"


def check_frontend(base: str) -> str:
    res = request(base, "GET", "/")
    expect_status(res, 200)
    if "text/html" not in res.content_type:
        raise CheckFailed(f"expected text/html, got {res.content_type or 'no content type'}")
    if b"<html" not in res.body.lower() and b"<!doctype html" not in res.body.lower():
        raise CheckFailed("response does not look like an HTML page")
    return "200 text/html"


def check_api_404(base: str) -> str:
    res = request(base, "GET", "/health/__smoke_404__")
    expect_status(res, 404)
    body = res.json_object()
    error = body.get("error")
    code = error.get("code") if isinstance(error, dict) else None
    if code != "NOT_FOUND":
        raise CheckFailed(f"expected error code NOT_FOUND, got {body!r}")
    return "404 JSON NOT_FOUND"


def make_login_check(email: str, password: str) -> Callable[[str], str]:
    def check_login(base: str) -> str:
        res = request(base, "POST", "/auth/login", {"email": email, "password": password})
        expect_status(res, 200)
        role = res.json_object().get("role")
        set_cookie = res.headers.get("Set-Cookie") or ""
        if not set_cookie.startswith("sid="):
            raise CheckFailed("login did not set the session cookie")
        cookie = set_cookie.split(";", 1)[0]
        me = request(base, "GET", "/auth/me", cookie=cookie)
        expect_status(me, 200)
        if me.json_object().get("email") != email:
            raise CheckFailed("/auth/me did not return the logged-in user")
        out = request(base, "POST", "/auth/logout", cookie=cookie)
        expect_status(out, 200)
        return f"200, session works and logged out (role {role})"

    return check_login


def run(name: str, check: Callable[[str], str], base: str, deadline: float) -> bool:
    attempt = 0
    while True:
        attempt += 1
        try:
            detail = check(base)
            print(f"PASS  {name}: {detail}")
            return True
        except Transient as err:
            if time.monotonic() + DELAY_SECONDS < deadline:
                time.sleep(DELAY_SECONDS)
                continue
            print(f"FAIL  {name}: {err} (after {attempt} attempt{'s' if attempt > 1 else ''})")
            return False
        except CheckFailed as err:
            print(f"FAIL  {name}: {err}")
            return False


# ------------------------------------------------------------------------------
# Sprint 2/3 feature journey (Issue #99) and access-restriction checks.
# Unlike the four core checks above, these run once (no retry loop): by the
# time they start, checks 1-4 already proved the service is up.
# ------------------------------------------------------------------------------

def today_bkk() -> str:
    return datetime.datetime.now(BANGKOK).strftime("%Y-%m-%d")


def add_days(date_str: str, days: int) -> str:
    d = datetime.date.fromisoformat(date_str) + datetime.timedelta(days=days)
    return d.isoformat()


def js_weekday(date_str: str) -> int:
    """0=Sunday..6=Saturday, matching JS Date.getUTCDay() (reminders.ts)."""
    python_weekday = datetime.date.fromisoformat(date_str).weekday()  # Mon=0..Sun=6
    return (python_weekday + 1) % 7


def step(results: list[bool], name: str, ok: bool, detail: str) -> bool:
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")
    results.append(ok)
    return ok


def login(base: str, email: str, password: str) -> str:
    res = request(base, "POST", "/auth/login", {"email": email, "password": password})
    if res.status != 200:
        raise CheckFailed(f"login as {email} failed: HTTP {res.status}")
    set_cookie = res.headers.get("Set-Cookie") or ""
    if not set_cookie.startswith("sid="):
        raise CheckFailed(f"login as {email} did not set the session cookie")
    return set_cookie.split(";", 1)[0]


def find_l7_template(base: str, cookie: str) -> dict | None:
    res = request(base, "GET", "/templates", cookie=cookie)
    if res.status != 200:
        return None
    for t in res.json():
        if isinstance(t, dict) and str(t.get("name", "")).startswith(L7_TEMPLATE_PREFIX):
            return t
    return None


def find_or_create_goal(results: list[bool], base: str, cookie: str, template: dict) -> int | None:
    template_id = template["id"]
    today = today_bkk()

    existing = request(base, "GET", "/goals", cookie=cookie).json()
    reused = next(
        (g for g in existing if g.get("templateId") == template_id and g.get("id") != L7_FIXTURE_GOAL_ID),
        None,
    )
    if reused is not None:
        step(results, "D2-GOAL-CREATE", True, f"reused goal {reused['id']} from an earlier run (idempotent)")
        return reused["id"]

    min_value, max_value = float(template["minValue"]), float(template["maxValue"])
    target = round(min(max(min_value, 1.0), max_value), 2)
    end_date = add_days(today, 6)
    res = request(
        base, "POST", "/goals",
        {"templateId": template_id, "dailyTarget": target, "startDate": today, "endDate": end_date},
        cookie=cookie,
    )
    if res.status == 409:
        # Another run created it between our GET and this POST; fetch again.
        existing = request(base, "GET", "/goals", cookie=cookie).json()
        reused = next(
            (g for g in existing if g.get("templateId") == template_id and g.get("id") != L7_FIXTURE_GOAL_ID),
            None,
        )
        if reused is not None:
            step(results, "D2-GOAL-CREATE", True, f"reused goal {reused['id']} (race with another run)")
            return reused["id"]
    if not step(results, "D2-GOAL-CREATE", res.status == 201,
                f"POST /goals startDate={today} endDate={end_date} -> expected 201, got {res.status}"):
        return None
    return res.json_object()["id"]


def run_feature_journey(base: str, email: str, password: str) -> list[bool]:
    results: list[bool] = []
    print("== Sprint 2/3 feature journey (participant 1) ==")
    try:
        cookie = login(base, email, password)
    except CheckFailed as err:
        step(results, "D2-LOGIN", False, str(err))
        return results

    template = find_l7_template(base, cookie)
    if template is None:
        print(f"SKIP  D2-feature-journey: no template named like \"{L7_TEMPLATE_PREFIX}*\" found; "
              "needs Lab 7's fixture (a Manager-created template this script cannot create itself)")
        request(base, "POST", "/auth/logout", cookie=cookie)
        return results

    goal_id = find_or_create_goal(results, base, cookie, template)
    if goal_id is None:
        request(base, "POST", "/auth/logout", cookie=cookie)
        return results
    today = today_bkk()

    # One entry for today, idempotent across same-day reruns (409 = already there).
    # Value = maxValue so it still meets the target after the F-06 revise below
    # bumps dailyTarget up to maxValue too: effectiveFrom for that revision is
    # today, same date as this entry, so "met" is judged against the REVISED
    # target, not the one in effect at the moment the entry was posted.
    min_value, max_value = float(template["minValue"]), float(template["maxValue"])
    entry_value = round(max_value, 2)
    entry_res = request(base, "POST", f"/goals/{goal_id}/entries", {"date": today, "value": entry_value},
                         cookie=cookie)
    step(
        results, "D2-ENTRY-TODAY", entry_res.status in (201, 409),
        f"POST /goals/{goal_id}/entries date={today} value={entry_value} -> {entry_res.status} "
        + ("(created)" if entry_res.status == 201 else "(already present from an earlier run today)"),
    )

    # F-06: revise, read back immediately.
    target = round(min(max(min_value, 1.0), max_value), 2)
    new_target = round(max_value, 2) if round(max_value, 2) != target else round(min_value, 2)
    new_end = add_days(today, 13)
    revise_res = request(base, "PATCH", f"/goals/{goal_id}", {"dailyTarget": new_target, "endDate": new_end},
                          cookie=cookie)
    revise_ok = (revise_res.status == 200 and revise_res.json_object().get("dailyTarget") == new_target
                 and revise_res.json_object().get("endDate") == new_end)
    step(results, "F06-REVISE", revise_ok,
         f"PATCH /goals/{goal_id} dailyTarget={new_target} endDate={new_end} -> "
         f"expected 200 with those effective values, got {revise_res.status} {revise_res.json() if revise_res.status < 500 else ''}")

    readback_res = request(base, "GET", f"/goals/{goal_id}", cookie=cookie)
    readback_ok = (readback_res.status == 200 and readback_res.json_object().get("dailyTarget") == new_target
                   and readback_res.json_object().get("endDate") == new_end)
    step(results, "F06-REVISE-READBACK", readback_ok,
         f"GET /goals/{goal_id} -> expected effective dailyTarget={new_target} endDate={new_end}, "
         f"got {readback_res.json() if readback_res.status == 200 else readback_res.status}")

    # F-06: a rule violation is rejected with the contract's exact status/message.
    bad_target = round(max_value + 1, 2)
    reject_res = request(base, "PATCH", f"/goals/{goal_id}", {"dailyTarget": bad_target}, cookie=cookie)
    reject_body = reject_res.json() if reject_res.status == 400 else None
    reject_ok = (
        reject_res.status == 400
        and isinstance(reject_body, dict)
        and reject_body.get("error", {}).get("code") == "VALIDATION_ERROR"
        and reject_body.get("error", {}).get("message") == "Daily target must be within the template range."
    )
    step(results, "F06-REVISE-REJECTED", reject_ok,
         f"PATCH /goals/{goal_id} dailyTarget={bad_target} (out of range) -> expected 400 VALIDATION_ERROR "
         f"\"Daily target must be within the template range.\", got {reject_res.status} {reject_body}")

    # F-07: streaks.
    streaks_res = request(base, "GET", f"/goals/{goal_id}/streaks", cookie=cookie)
    streaks_body = streaks_res.json_object() if streaks_res.status == 200 else {}
    streaks_ok = (streaks_res.status == 200 and streaks_body.get("currentStreak", 0) >= 1
                  and streaks_body.get("longestStreak", 0) >= 1)
    step(results, "F07-STREAKS", streaks_ok,
         f"GET /goals/{goal_id}/streaks -> expected currentStreak>=1 and longestStreak>=1 "
         f"(today's entry meets target), got {streaks_body if streaks_res.status == 200 else streaks_res.status}")

    # F-08: summary (week/month windows).
    summary_res = request(base, "GET", f"/goals/{goal_id}/summary", cookie=cookie)
    summary_body = summary_res.json_object() if summary_res.status == 200 else {}
    week, month = summary_body.get("week", {}), summary_body.get("month", {})
    summary_ok = (summary_res.status == 200 and week.get("daysRecorded", 0) >= 1 and week.get("daysMet", 0) >= 1
                  and month.get("daysRecorded", 0) >= 1 and month.get("daysMet", 0) >= 1)
    step(results, "F08-SUMMARY", summary_ok,
         f"GET /goals/{goal_id}/summary -> expected week/month daysRecorded>=1 and daysMet>=1, "
         f"got week={week} month={month}" if summary_res.status == 200 else
         f"GET /goals/{goal_id}/summary -> expected 200, got {summary_res.status}")

    # F-09: PUT, GET, then (held until after the P2 access check below) DELETE + confirm gone.
    weekdays = [js_weekday(today)]
    put_res = request(base, "PUT", f"/goals/{goal_id}/reminder", {"weekdays": weekdays, "time": "09:00"},
                       cookie=cookie)
    put_body = put_res.json_object() if put_res.status == 200 else {}
    put_ok = put_res.status == 200 and put_body.get("weekdays") == weekdays and put_body.get("time") == "09:00"
    step(results, "F09-REMINDER-PUT", put_ok,
         f"PUT /goals/{goal_id}/reminder weekdays={weekdays} time=09:00 -> expected 200 echoing that, "
         f"got {put_res.status} {put_body}")

    get_res = request(base, "GET", f"/goals/{goal_id}/reminder", cookie=cookie)
    get_body = get_res.json_object() if get_res.status == 200 else {}
    get_ok = get_res.status == 200 and get_body.get("weekdays") == weekdays and get_body.get("time") == "09:00"
    step(results, "F09-REMINDER-GET", get_ok,
         f"GET /goals/{goal_id}/reminder -> expected 200 {{weekdays: {weekdays}, time: '09:00'}}, "
         f"got {get_res.status} {get_body}")

    return results + run_access_and_persistence(base, cookie, goal_id, today, new_target, new_end)


def run_access_and_persistence(base: str, p1_cookie: str, goal_id: int, today: str,
                                expected_target: float, expected_end: str) -> list[bool]:
    results: list[bool] = []

    p2_email, p2_password = os.environ.get("SMOKE_EMAIL_2", ""), os.environ.get("SMOKE_PASSWORD_2", "")
    if p2_email and p2_password:
        print("== Access restriction (participant 2) ==")
        try:
            p2_cookie = login(base, p2_email, p2_password)
            read_res = request(base, "GET", f"/goals/{goal_id}", cookie=p2_cookie)
            read_body = read_res.json() if read_res.status == 404 else None
            step(results, "P2-CANNOT-READ-GOAL",
                 read_res.status == 404 and isinstance(read_body, dict)
                 and read_body.get("error", {}).get("code") == "NOT_FOUND",
                 f"GET /goals/{goal_id} as participant 2 -> expected 404 NOT_FOUND, got {read_res.status} {read_body}")

            revise_res = request(base, "PATCH", f"/goals/{goal_id}", {"dailyTarget": 1}, cookie=p2_cookie)
            revise_body = revise_res.json() if revise_res.status == 404 else None
            step(results, "P2-CANNOT-REVISE-GOAL",
                 revise_res.status == 404 and isinstance(revise_body, dict)
                 and revise_body.get("error", {}).get("code") == "NOT_FOUND",
                 f"PATCH /goals/{goal_id} as participant 2 -> expected 404 NOT_FOUND, got {revise_res.status} {revise_body}")

            reminder_get_res = request(base, "GET", f"/goals/{goal_id}/reminder", cookie=p2_cookie)
            reminder_get_body = reminder_get_res.json() if reminder_get_res.status == 404 else None
            step(results, "P2-CANNOT-READ-REMINDER",
                 reminder_get_res.status == 404 and isinstance(reminder_get_body, dict)
                 and reminder_get_body.get("error", {}).get("code") == "NOT_FOUND",
                 f"GET /goals/{goal_id}/reminder as participant 2 -> expected 404 NOT_FOUND, "
                 f"got {reminder_get_res.status} {reminder_get_body}")

            reminder_put_res = request(base, "PUT", f"/goals/{goal_id}/reminder",
                                        {"weekdays": [0], "time": "08:00"}, cookie=p2_cookie)
            reminder_put_body = reminder_put_res.json() if reminder_put_res.status == 404 else None
            step(results, "P2-CANNOT-SET-REMINDER",
                 reminder_put_res.status == 404 and isinstance(reminder_put_body, dict)
                 and reminder_put_body.get("error", {}).get("code") == "NOT_FOUND",
                 f"PUT /goals/{goal_id}/reminder as participant 2 -> expected 404 NOT_FOUND, "
                 f"got {reminder_put_res.status} {reminder_put_body}")

            request(base, "POST", "/auth/logout", cookie=p2_cookie)
        except CheckFailed as err:
            step(results, "P2-ACCESS-CHECKS", False, str(err))
    else:
        print("SKIP  P2-access-checks: SMOKE_EMAIL_2/SMOKE_PASSWORD_2 not set")

    # F-09: delete the reminder now (after the P2 checks exercised it), confirm gone.
    del_res = request(base, "DELETE", f"/goals/{goal_id}/reminder", cookie=p1_cookie)
    step(results, "F09-REMINDER-DELETE", del_res.status == 204,
         f"DELETE /goals/{goal_id}/reminder -> expected 204, got {del_res.status}")
    gone_res = request(base, "GET", f"/goals/{goal_id}/reminder", cookie=p1_cookie)
    gone_body = gone_res.json() if gone_res.status == 404 else None
    step(results, "F09-REMINDER-GONE",
         gone_res.status == 404 and isinstance(gone_body, dict) and gone_body.get("error", {}).get("code") == "NOT_FOUND",
         f"GET /goals/{goal_id}/reminder after DELETE -> expected 404 NOT_FOUND, got {gone_res.status} {gone_body}")

    request(base, "POST", "/auth/logout", cookie=p1_cookie)

    # Persistence: a fresh login session (brand-new cookie), not the one used above.
    p1_email, p1_password = os.environ.get("SMOKE_EMAIL", ""), os.environ.get("SMOKE_PASSWORD", "")
    print("== Persistence (fresh login session) ==")
    try:
        fresh_cookie = login(base, p1_email, p1_password)
    except CheckFailed as err:
        step(results, "PERSIST-FRESH-LOGIN", False, str(err))
        return results

    persist_res = request(base, "GET", f"/goals/{goal_id}", cookie=fresh_cookie)
    persist_body = persist_res.json_object() if persist_res.status == 200 else {}
    persist_ok = (persist_res.status == 200 and persist_body.get("dailyTarget") == expected_target
                  and persist_body.get("endDate") == expected_end)
    step(results, "PERSIST-ACROSS-SESSION", persist_ok,
         f"GET /goals/{goal_id} on a brand-new login -> expected the revised dailyTarget={expected_target} "
         f"endDate={expected_end} to still be there, got {persist_body if persist_res.status == 200 else persist_res.status}")

    # Persistence across this release: the Lab 7 fixture (pre-Sprint-2 data).
    print(f"== Persistence across releases (Lab 7 fixture, goal {L7_FIXTURE_GOAL_ID}) ==")
    l7_goal_res = request(base, "GET", f"/goals/{L7_FIXTURE_GOAL_ID}", cookie=fresh_cookie)
    step(results, "PERSIST-LAB7-GOAL", l7_goal_res.status == 200,
         f"GET /goals/{L7_FIXTURE_GOAL_ID} (Lab 7 fixture) -> expected 200, got {l7_goal_res.status} "
         "(if this fails, the fixture may have been manually cleaned up since Lab 7 - report plainly, do not fabricate)")

    l7_entries_res = request(base, "GET", f"/goals/{L7_FIXTURE_GOAL_ID}/entries", cookie=fresh_cookie)
    l7_dates = (
        {e["date"] for e in l7_entries_res.json()} if l7_entries_res.status == 200 and isinstance(l7_entries_res.json(), list)
        else set()
    )
    missing = [d for d in L7_FIXTURE_ENTRY_DATES if d not in l7_dates]
    step(results, "PERSIST-LAB7-ENTRIES", l7_entries_res.status == 200 and not missing,
         f"GET /goals/{L7_FIXTURE_GOAL_ID}/entries -> expected dates {L7_FIXTURE_ENTRY_DATES} present, "
         f"got {sorted(l7_dates)} (missing: {missing})" if l7_entries_res.status == 200
         else f"GET /goals/{L7_FIXTURE_GOAL_ID}/entries -> expected 200, got {l7_entries_res.status}")

    request(base, "POST", "/auth/logout", cookie=fresh_cookie)
    return results


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not argv[1].startswith(("http://", "https://")):
        print("usage: python3 deploy/smoke_test.py https://<service-url>", file=sys.stderr)
        return 2
    base = argv[1].rstrip("/")
    print(f"Smoke testing {base}")

    checks: list[tuple[str, Callable[[str], str]]] = [
        ("health", check_health),
        ("readiness/DB", check_ready),
        ("HTML frontend", check_frontend),
        ("JSON 404 for unknown API path", check_api_404),
    ]

    email = os.environ.get("SMOKE_EMAIL", "")
    password = os.environ.get("SMOKE_PASSWORD", "")
    if email and password:
        checks.append(("login", make_login_check(email, password)))
    elif email or password:
        print("FAIL  login: set both SMOKE_EMAIL and SMOKE_PASSWORD, or neither")
        return 1

    deadline = time.monotonic() + MAX_WAIT_SECONDS
    results = [run(name, check, base, deadline) for name, check in checks]
    if not (email and password):
        print("SKIP  login: SMOKE_EMAIL/SMOKE_PASSWORD not set")

    if email and password:
        results.extend(run_feature_journey(base, email, password))
    else:
        print("SKIP  D2-feature-journey: SMOKE_EMAIL/SMOKE_PASSWORD not set")
        print("SKIP  P2-access-checks: SMOKE_EMAIL/SMOKE_PASSWORD not set (needed for the goal under test)")

    passed = sum(results)
    print(f"{passed}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
