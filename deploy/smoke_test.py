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

Retries: only failures that can clear up while a new Cloud Run revision starts
(connection errors, timeouts, HTTP 5xx such as /ready 503) are retried, and
only until SMOKE_MAX_WAIT_SECONDS (default 120) after the run started; after
that each check gets one attempt. A 4xx or a wrong body fails at once.
Exits 0 when every check passes, 1 on any failure, 2 on bad usage.
Standard library only.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Callable

MAX_WAIT_SECONDS = float(os.environ.get("SMOKE_MAX_WAIT_SECONDS", "120"))
DELAY_SECONDS = float(os.environ.get("SMOKE_DELAY_SECONDS", "6"))
TIMEOUT_SECONDS = 10
USER_AGENT = "habit-tracker-smoke-test"


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

    passed = sum(results)
    print(f"{passed}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
