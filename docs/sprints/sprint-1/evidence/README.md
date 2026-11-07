# F-01 evidence notes

- `F-01-red.txt` / `F-01-green.txt`: initial red/green runs from PR #9.
- `F-01-red-2.txt` / `F-01-green-2.txt`: red/green runs for the PR #9 review follow-up
  (contract v1.2 — TEST-01.3 cookie replay, TEST-01.11 error handling).

**Note on TEST-01.6:** this test reads back the `passwordHash` that the test's own `beforeEach`
wrote directly via `prisma.user.create({ ..., passwordHash: await bcrypt.hash(...) })`, and asserts
that value differs from the plaintext and verifies with `bcrypt.compare`. It therefore passes in
every run, including the very first red run, because it never calls application code (no route,
no service) — it only checks that bcrypt itself round-trips correctly. It is not evidence that the
login/seed code hashes passwords correctly; that is exercised indirectly by TEST-01.1 and
TEST-01.2a/b, which only succeed/fail correctly if `/auth/login` compares against a real bcrypt
hash.

# F-02 evidence notes

- `F-02-red.txt` / `F-02-green.txt`: red/green runs for F-02 (activity templates, contract v1.1).
  The red run also surfaced a pre-existing harness gap: Vitest runs separate spec files in
  parallel by default, but `auth.test.ts` and `templates.test.ts` share one Postgres test
  database that `tests/setup.ts` wipes in every `beforeEach`; running both files at once raced
  resets against inserts across files and even broke F-01 tests. Fixed by setting
  `test.fileParallelism: false` in `backend/vitest.config.ts` (`4944241`), not by changing either
  test file.

# F-05 evidence notes

- `F-05-red.txt`: run for F-05 (access-control tests, contract v1.1) committed in the
  `test/f-05-access-control` branch, written against the real F-01/F-02 code and direct-Prisma
  fixtures (Manager `M`, Participants `P1`/`P2`, template `T`, goal `G1` owned by `P1`, entry `E1`),
  with no goal or entry routes implemented yet (F-03/F-04 not merged). Result:
  `Test Files 1 failed | 3 passed (4)` / `Tests 19 failed | 48 passed (67)`.
  - **Passing now (Stage A, 4 tests):** `TEST-05.1a`, `TEST-05.1b`, `TEST-05.2a`, `TEST-05.2b` —
    these only exercise `/auth/*` and `/templates/*`, both already merged (F-01, F-02).
  - **Red until F-03/F-04 merge (19 tests):** `TEST-05.1c`, `05.1d`, `05.3a`–`05.3e`, `05.4a`–`05.4c`,
    `05.5`, `05.6`, `05.7a`–`05.7d`, `05.9a`–`05.9c`. Every one of these fails with a clean
    `expected 404 to be <200|201|400|401|403|409>` assertion mismatch — Express returns its default
    404 because no `/goals*` route is mounted, not a config/compile/fixture error. The ownership
    tests (`05.4`, `05.5`, `05.7a`–`d`, `05.9a`–`c`) each assert the legitimate owner's expected
    response *before* comparing the non-owner's response to a missing-id response, so none of them
    passes vacuously on the coincidental 404-vs-404 comparison alone — confirmed by this run, where
    every one of those tests fails at (or before) that first control assertion.
  - All 44 pre-existing F-01 and F-02 tests still pass unchanged; `backend/tests/auth.test.ts` and
    `backend/tests/templates.test.ts` were not edited.
  - Verified stable: the full suite was run twice in a row (identical `19 failed | 48 passed`) and
    `tests/access.test.ts` was run alone (`19 failed | 4 passed (23)`, same split).

# F-03 evidence notes

- `F-03-red.txt`: run for F-03 (goals, contract v1.1) with `backend/tests/goals.test.ts` committed
  and no goal routes. Result: `Test Files 2 failed | 4 passed (6)` / `Tests 57 failed | 51 passed (108)`.
  All 38 `TEST-03.*` fail plus the 19 F-05 Stage-A tests; every failure is an assertion mismatch
  (Express's default 404 instead of 201/400/401/403/409, or a missing `error.code`), not a compile,
  config or fixture error. No `TEST-03.*` passes vacuously: every rejection test also asserts
  `error.code` and `error.message`, which a missing route does not return.
- `F-03-green.txt`: run after the goal routes. Result: `Test Files 1 failed | 5 passed (6)` /
  `Tests 12 failed | 96 passed (108)` (96 = 51 earlier + 38 `TEST-03.*` + 7 F-05). The 12 red tests
  are exactly the F-04 set in `F-03-goals.md` §5.1 (`TEST-05.1d`, `05.3d`, `05.3e`, `05.4b`, `05.4c`,
  `05.5`, `05.7b`–`d`, `05.9a`–`c`), each failing with `expected 404 to be <200|201|400|401|403|409>`
  because the entry/progress routes are missing. Run three times in a row with identical results
  (TEST-03.10 concurrency is stable).
- Both runs used Node 22. An earlier attempt on Node 20 crashed Vitest's reporter
  (`Map.groupBy is not a function`) and another with the dev database stopped failed every test;
  both were discarded, not saved as evidence. README now says Node 22+.

# F-04 evidence notes

- `F-04-red.txt`: run for F-04 (entries, progress, history; contract v1.1) with
  `backend/tests/entries.test.ts` committed and no entry/progress routes. Result:
  `Test Files 2 failed | 5 passed (7)` / `Tests 56 failed | 96 passed (152)`: all 44 `TEST-04.*` plus the
  12 F-05 tests that need F-04, every one an assertion mismatch (Express's default 404 instead of the
  expected status or `error.code`), not a compile, config, clock or fixture error. Each test sets its
  clock before logging in (8-hour session), so no test fails on an expired session.
- `F-04-green.txt`: run after the routes. Result: `Test Files 7 passed (7)` / `Tests 152 passed (152)`.
- Extra check, not saved as evidence: replacing the Asia/Bangkok "today" with the server's local date
  makes `TEST-04.8a` and `TEST-04.14d` fail (they run with `TZ=America/Los_Angeles`), so the time-zone
  tests do catch a local-time implementation. The code was restored before the green run.

# F-05 evidence notes (Stage B)

- `F-05-green.txt`: full suite after F-03 and F-04, run with `--reporter=verbose` so every test name
  is listed. Result: `Test Files 7 passed (7)` / `Tests 152 passed (152)`; all 23 `TEST-05.*` pass.
  `backend/tests/access.test.ts` is unchanged since PR #17.
