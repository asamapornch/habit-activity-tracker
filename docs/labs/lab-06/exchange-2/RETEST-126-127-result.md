# Retest of partner Issues #126 and #127 — Result record

Scope: retest the partner's fixes for `phittayanan/habit-tracker` issues #126 (NUL in login username → 500) and #127 (NUL in template name/unit → 500), on the partner's **deployed** app, under the written OK in issue #130 (comment at 2026-11-26T11:03:32Z). Only the four cases the partner's own retest requests named were run — nothing else.

| Field | Entry |
|---|---|
| Authorization | Written OK, `phittayanan/habit-tracker#130`, comment 2026-11-26T11:03:32Z: *"You may send requests to https://habit-tracker-rfi4eg2u4q-as.a.run.app only to retest #126 and #127 as described in those Issues, including the sign-in and read requests needed to run them and to check that nothing changed. Please use only the three agreed accounts and synthetic data."* |
| Tester | asamapornch (only; this retest was not run jointly with warunwora) |
| Tested version | Tag `v1.4`, commit `056ee5c59d1292ad0805f8f5c8c80e1c0e2c3636`, `build` label `056ee5c`, Cloud Run revision `habit-tracker-00007-7pd` |
| Version confirmation | `GET /` raw HTML: `<meta name="build" content="056ee5c">`; `GET /api/health` → `{"status":"ok"}`; `GET /api/ready` → `{"status":"ready"}`; also visually confirmed "build 056ee5c" on the login page in-browser |
| Date/time | 2026-11-26, about 21:10 to 21:30 (Asia/Bangkok), approximate, taken from the session clock; the exact time per request was not logged |
| Accounts used | manager1 (#127 create and #127 edit); anonymous/no session (both #126 login cases) |

## Results

| # | Case | Request | Expected (per partner's retest request) | Actual | Compare |
|---|---|---|---|---|---|
| 1 | #126 control | `POST /api/auth/login` `{"username":"nouser-exp-tn","password":"<redacted>"}` | `401 INVALID_CREDENTIALS` | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"Username or password is incorrect."}}`; confirmed no session created (`GET /api/auth/me` → `401 UNAUTHENTICATED`) | matches — **PASS** |
| 2 | #126 NUL username | `POST /api/auth/login` `{"username":"nouser-exp-tn\u0000X","password":"<redacted>"}` | `401 INVALID_CREDENTIALS`, same body as control, no session | `401 {"error":{"code":"INVALID_CREDENTIALS","message":"Username or password is incorrect."}}` — identical body to case 1; confirmed no session created (`GET /api/auth/me` → `401 UNAUTHENTICATED`) | matches — **PASS** |
| 3 | #127 create | `POST /api/templates` as manager1, `{"name":"EXP-RETEST-NUL\u0000X","unit":"x","minValue":1,"maxValue":10}` | `400 VALIDATION_ERROR`, nothing stored | `400 {"error":{"code":"VALIDATION_ERROR","message":"Name must be 1 to 100 characters."}}`; confirmed nothing stored (`GET /api/templates` afterward lists the same 9 templates as before, no new row) | matches — **PASS** |
| 4 | #127 edit | `PATCH /api/templates/18` (`EXP-EditA`, our own unused template from EXP-1), `{"unit":"X\u0000Y"}` | `400 VALIDATION_ERROR`, nothing changed | `400 {"error":{"code":"VALIDATION_ERROR","message":"Unit must be 1 to 30 characters."}}`; confirmed unchanged (`GET /api/templates` shows `{"id":18,"name":"EXP-EditA","unit":"a","minValue":1,"maxValue":10,"state":"ACTIVE"}`, identical to before — the API does not expose a `createdAt`/`updatedAt` field to check separately) | matches — **PASS** |

## Note on the password value used

The two login retest requests above used a synthetic placeholder password (`<redacted>` in this file — never printed or logged by this tooling), since the point of both cases is the *username* field; the actual value typed is irrelevant to the result (both an unknown username with and without a NUL character correctly get `401 INVALID_CREDENTIALS` regardless of the password supplied, per AC-01.2's "same answer" rule). No real account password was used, read, or stored anywhere in this retest.

## Case 4 — why it used our own `EXP-EditA` template, not a partner seed template

The partner's retest request for #127 asks for "an edit of an **unused** template with a NUL character in `unit`." A read-only check (within the written OK's scope: "read requests needed to run them and to check that nothing changed") first established which templates exist and which are used:

**Templates visible to Manager (manager1):** `exp-dup`, `EXP-Dup`, `EXP-EditA`, `EXP-EditB`, `Reading`, `UAT-02 Squats`, `UAT-04 Stretch`, `Walking`, `Water`.

Cross-referencing against this team's own prior, directly-verified UAT records (UAT-01 through UAT-04 and EXP-1 result files, all run against this same deployed app and never reset since — the partner confirmed in #130 "we will not reset them for now"):
- `Water`, `Reading`, `Walking` (the partner's three original seed templates): all **used** — each has a goal from UAT-01/02/03.
- `UAT-02 Squats`, `UAT-04 Stretch`: also **used** (goals from UAT-02/04).
- `exp-dup`, `EXP-Dup`, `EXP-EditA`, `EXP-EditB`: **unused** — but these are **our own synthetic test artifacts created during EXP-1 (by manager1), not part of the partner's seed data.**

No unused template that is clearly part of the partner's own seed data exists on the deployed app, and creating a new one for this purpose was ruled out as not covered by the written OK. The human tester then explicitly authorized using one of our own already-existing, already-unused `EXP-*` templates instead, since #127 only requires "an edit of an unused template" and no new data needed to be created. **`EXP-EditA` (id 18) was selected** — confirmed by a read request (`GET /api/templates`) to still exist exactly as created during EXP-1 (unit `a`, range 1–10, state `ACTIVE`), consistent with it being synthetic, ours, and unused. The template API does not expose a `createdBy` or `createdAt`/`updatedAt` field, so "belongs to manager1" and "never had a goal" rest on this team's own verified prior record (we created it, and Sprint 1 has no delete for templates or goals) rather than a field the API surfaces directly — stated here for transparency.

No other template was edited.

## Summary

| Issue | Retest result |
|---|---|
| #126 (login NUL) | **PASS** — both cases match, fix confirmed on `build 056ee5c` |
| #127 (template create NUL) | **PASS** — fix confirmed on `build 056ee5c` |
| #127 (template edit NUL) | **PASS** — retested against our own unused `EXP-EditA` (id 18), fix confirmed on `build 056ee5c`; template confirmed unchanged afterward |

The retest results were posted to GitHub by asamapornch on 2026-11-26 as comments on https://github.com/phittayanan/habit-tracker/issues/126#issuecomment-7194992804 (21:33:33 Asia/Bangkok) and https://github.com/phittayanan/habit-tracker/issues/127#issuecomment-7194997077 (21:33:43 Asia/Bangkok). The partner agreed with both results and closed both Issues at 22:01 (Asia/Bangkok). No password, token, or cookie value was printed, logged, or stored anywhere in this file or in the course of this retest.
