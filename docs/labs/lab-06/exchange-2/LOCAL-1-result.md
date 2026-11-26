# LOCAL-1 — Robustness testing of the partner's app (local only)

Scope: find bugs of the same class confirmed in our own app (an oversized/malformed field causing `500` instead of `400`), in the partner's app (`phittayanan/habit-tracker`), by reading their public code (commit `50f5605d266d881b4afba3f8ac96d40882f26fd2`, the version under test) and testing **only on localhost**. No request was sent to their deployed app in this task.

| Field | Entry |
|---|---|
| Code read | `server/src/app.js`, `server/src/middleware/auth.js`, `server/src/routes/{auth,templates,goals,entries}.js`, `server/src/services/{auth,template,goal,goal-rules,entry,entry-rules}.js`, and `docs/sprints/sprint-1/{F-01-login,F-03-template-create,F-04-template-edit,F-07-goal,F-08-entry}.md` |
| Local stack | `~/uat-work/local-run/docker-compose.yml`: their `server/Dockerfile` built against a throw-away `postgres:16-alpine` (tmpfs data, random local-only credentials), server on `localhost:4100`. Ran via `docker compose -p uat-local1`, torn down with `-v` after testing; nothing left running. Did not touch the unrelated pre-existing `habit-tracker-app`/`db` containers from `/Users/asamagus/Downloads/habit-tracker`. |
| Seed passwords | Generated with `openssl rand -base64 24` directly into a local `.env` file, used only to log in locally, deleted after the session. Never printed, never committed. |
| Accounts used | `manager1` (seeded Manager), `participant1` (seeded Participant) |

## Candidate weaknesses identified by code reading

| # | Class | File:line | AC it would violate (quoted) | Exact input | Expected response | Why suspected |
|---|---|---|---|---|---|---|
| 1 | NUL character in a stored text field | `server/src/services/template.js` `text()` helper (line 23), used by `createBody`/`editBody`; error handling in `createTemplate`/`editTemplate` only catches Prisma code `P2002` and re-throws everything else (lines 116–127, 74–95) | AC-03.3: *"A missing, empty or non-string name or unit, a name or unit over the length limit... get 400 VALIDATION_ERROR and nothing is stored."* A NUL-containing name is none of those — present, a string, within length — so per AC-03.3's own enumeration it is not an invalid case, and per AC-03.1 (*"A Manager who sends a valid request gets 201..."*) it should succeed. | `POST /api/templates` `{"name":"EXP-LOCAL-NUL\u0000X","unit":"x","minValue":1,"maxValue":10}` | 201 (per AC-03.1, since AC-03.3 doesn't list this as invalid) | Zod's `.trim().min(1).max(n)` does not reject embedded NUL bytes, but PostgreSQL text columns cannot store `\0`; the resulting DB error isn't Prisma code `P2002`, so it's re-thrown and falls through to the generic 500 handler in `app.js`. |
| 2 | Same, on edit | `server/src/services/template.js` `editBody`/`editTemplate` (same code path) | AC-04.1/AC-04.3 (edit of an unused template with valid fields succeeds; nothing in AC-04.3/AC-04.4's lists covers NUL) | `PATCH /api/templates/:id` `{"unit":"X\u0000Y"}` | 200 | Same root cause as #1 |
| 3 | NUL character in login username | `server/src/services/auth.js` line 11 (`db.user.findUnique({ where: { username: credentials.username } })`); `server/src/routes/auth.js` lines 15–21 (no try/catch around the login handler at all) | AC-01.2: *"An unknown username and a wrong password each get 401 INVALID_CREDENTIALS with the same message..."* A NUL-containing username is a valid non-empty string per AC-01.3's own list (not missing/empty/non-string), so it should be treated as merely unknown and get 401. | `POST /api/auth/login` `{"username":"nouser\u0000X","password":"whatever"}` | 401 INVALID_CREDENTIALS | Same Postgres NUL-byte restriction applies to a query *parameter*, not just storage; the login route has no try/catch, relying entirely on the framework to forward the rejection. |

Other classes checked by code reading and judged **not** suspicious, with the specific defensive code found (tested anyway for confirmation, see table below): oversized body (handled by the shared `entity.too.large` branch in `app.js`), malformed JSON (`entity.parse.failed`, same branch), wrong Content-Type (body-parser silently skips, falls into normal "missing field" validation), body that is an array/null/a string (Zod/body-parser strict-mode both produce a clean 400), very long username/password (no `.max()` on login credentials, but nothing in the code *stores* them and bcrypt's own 72-byte truncation is standard library behavior, not a crash risk), numeric edge cases (`validTarget`/`acceptableDecimal` explicitly bound magnitude and count decimal places via string parsing, and Zod's `z.number()` rejects non-numeric types outright), ids with leading zeros or above `2147483647` (template edit id is checked with `/^[1-9]\d*$/` then `id > largestId`; goal `templateId` is `z.number().int().positive().max(2147483647)`; entry/goal `:id` path param uses `/^\d{1,10}$/` plus a `> 2147483647` check), invalid calendar dates (`calendarDate()` does a round-trip `toISOString()` comparison that catches both rollover dates like `2026-02-30` and the `0000-00-00` case explicitly), and unknown fields (Zod's default object behavior strips them, matching `OP-07.7`/`OP-03.*`).

## Local test results

All requests below were sent to `http://localhost:4100` only.

| # | Class | Request | Expected | Actual (status + body, verbatim) | Compare |
|---|---|---|---|---|---|
| 1 | **NUL in template name (create)** | `POST /api/templates` as manager1, `{"name":"EXP-LOCAL-NUL\u0000X","unit":"x","minValue":1,"maxValue":10}` | 201 | `500 {"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again."}}` | **differs** |
| 2 | **NUL in template unit (edit)** | `PATCH /api/templates/1` as manager1, `{"unit":"X\u0000Y"}` (template unused) | 200 | `500 {"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again."}}` | **differs** |
| 3 | **NUL in login username** | `POST /api/auth/login` `{"username":"nouser\u0000X","password":"whatever"}` | 401 `INVALID_CREDENTIALS` | `500 {"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again."}}`, no `Set-Cookie` | **differs** |
| 4 | Oversized body (150,056 bytes, name 150,000 chars) | `POST /api/templates` as manager1 | 400 `VALIDATION_ERROR` | `400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid JSON body."}}` | matches |
| 5 | Malformed JSON | `POST /api/templates` as manager1, `{"name":"x", "unit":` | 400 `VALIDATION_ERROR` | same message | matches |
| 6 | Wrong Content-Type (`text/plain`, valid JSON text) | `POST /api/templates` as manager1 | 400 (treated as missing fields) | `400 {"error":{"code":"VALIDATION_ERROR","message":"Name must be 1 to 100 characters."}}` | matches |
| 7 | Body is a JSON array | `POST /api/templates` as manager1, `["x","y"]` | 400 | `400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid input: expected object, received array"}}` | matches |
| 8 | Body is JSON `null` | `POST /api/templates` as manager1, `null` | 400 | `400 {"error":{"code":"VALIDATION_ERROR","message":"Invalid JSON body."}}` | matches |
| 9 | Body is a bare JSON string | `POST /api/templates` as manager1, `"just a string"` | 400 | same message as #8 | matches |
| 10 | Unknown fields | `POST /api/templates` as manager1, extra `state:"RETIRED"`, `createdBy:999` | 201, fields stripped | `201 {"template":{"id":2,"name":"LOCAL-Unknown",...,"state":"ACTIVE"}}` | matches |
| 11 | `dailyTarget = 1e308` | `POST /api/goals` as participant1 | 400 `VALIDATION_ERROR` | `400 {"error":{"code":"VALIDATION_ERROR","message":"Choose a template, a valid daily target and valid start and end dates."}}` | matches |
| 12 | `dailyTarget = -0` | same | 400 | same message | matches |
| 13 | `dailyTarget = "NaN"` (string) | same | 400 | same message | matches |
| 14 | `dailyTarget = "5"` (numeric string) | same | 400 | same message | matches |
| 15 | `startDate = "2026-02-30"` | same | 400 | same message | matches |
| 16 | `startDate = "0000-00-00"` | same | 400 | same message | matches |
| 17 | Template edit id `"007"` (leading zero) | `PATCH /api/templates/007` as manager1 | 400 | `400 {"error":{"code":"VALIDATION_ERROR","message":"Template id must be a positive whole number."}}` | matches |
| 18 | Template edit id `9999999999` (> int32 max) | `PATCH /api/templates/9999999999` as manager1 | 404 | `404 {"error":{"code":"TEMPLATE_NOT_FOUND","message":"Template not found."}}` | matches |
| 19 | Very long username (50,000 chars) at login | `POST /api/auth/login` | 401 (no such user) | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"Username or password is incorrect."}}` | matches |
| 20 | Very long password (50,000 chars) at login | `POST /api/auth/login` as `manager1` | 401 (wrong password) | same message | matches |
| 21 | Template name = 60 emoji (60 codepoints, 120 UTF-16 units) | `POST /api/templates` as manager1 | Ambiguous by naive UTF-16 `.length` (would be 120 > 100); codepoint-aware would accept | `201`, name stored with all 60 emoji | matches (codepoint-aware) |
| 22 | Template name = 100 emoji (100 codepoints, 200 units) | same | boundary case | `201` | matches (codepoint-aware) |
| 23 | Template name = 101 emoji (101 codepoints, 202 units) | same | should reject at 101 "characters" | `400 {"error":{"code":"VALIDATION_ERROR","message":"Name must be 1 to 100 characters."}}` | matches — confirms the 100-character limit is **codepoint-based**, not naive UTF-16-unit-based (Zod v4.6.7) |

No request was retried to try to force a difference; every "differs" row above was reproduced exactly once per input, read verbatim, and immediately checked for anything stored (see below).

## Findings (for #1–#3, all the same root cause)

### Confirmed: NUL byte (`\u0000`) in a text field reaches the database unguarded and causes `500 INTERNAL_ERROR`

- **Is it a defect or an enhancement?** A **defect**. AC-03.3 and AC-01.3 each enumerate the specific invalid-input cases that must get `400`/`401`; a NUL-containing string is not among them (it is a non-empty string within the length limit), so by the contract's own logic it should be treated as valid input and either succeed (template create/edit) or be correctly classified as "unknown" (login) — not crash with `500`. The dedicated error-handling middleware in `app.js` (which explicitly catches `entity.parse.failed`/`entity.too.large` to avoid exactly this kind of leak, and the comment *"Do not print ORM errors: they may include sensitive query parameters"*) shows the authors' own intent that 500 is reserved for genuinely unexpected faults, not for a reachable, specific, reproducible client input.
- **Proposed severity:** **Minor**, by user impact. Reasoning: no data is lost, no protected data is exposed, and nothing is stored (confirmed empirically — the templates list was checked and empty/unchanged after each failed attempt, and no session/cookie was issued for the login case). The failure mode is a generic `500` with a generic message, not a crash of the process (the container stayed up and kept serving other requests throughout testing) and not an information leak. It is, however, a real, trivially reproducible contract violation (wrong status code on a predictable input) across three separate endpoints, so it is not purely cosmetic either — hence "minor," not "trivial."
- **Shortest reproduction on the deployed app (not run, for the Product Team to try):**
  1. Log in as a Manager.
  2. Open the browser console and run:
     ```js
     await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name: 'EXP-NUL\u0000X', unit: 'x', minValue: 1, maxValue: 10 }) })
       .then(r => r.status + ' ' + r.statusText)
     ```
  3. Expect `500`, body `{"error":{"code":"INTERNAL_ERROR","message":"Something went wrong. Please try again."}}`.
  4. For the login variant, log out first, then from the login page's console: `await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'nouser\u0000X', password:'x'})}).then(r => r.status)` — expect `500`.

This is not a localhost artifact: the root cause is in the shared validation code (`text()` in `template.js`, the `credentials` schema in `auth.js`) and the shared error-handling middleware (`app.js`), none of which differ between local and deployed configuration — the only environment-specific pieces (session cookie `Secure` flag, `TZ`) are unrelated to this bug.

## Not reported as defects (localhost-only or non-issues)

- The `Secure` cookie flag (set because `NODE_ENV=production` in both local and deployed config) meant `curl`'s cookie jar silently dropped the session cookie over plain HTTP locally — a testing artifact on my end, not a finding; worked around by reading the session ID directly from the `Set-Cookie` header.
- Items 4–23 above all matched their expected contract behavior and are not findings.

## Stopped here, as requested — no issue has been filed anywhere.
