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
