# F-01 evidence notes

- `F-01-red.txt` / `F-01-green.txt`: initial red/green runs from PR #9.
- `F-01-red-2.txt` / `F-01-green-2.txt`: red/green runs for the PR #9 review follow-up
  (contract v1.2 — TEST-01.3 cookie replay, TEST-01.11 error handling).

# F-02 evidence notes

- `F-02-red.txt` / `F-02-green.txt`: red/green runs for F-02 (activity templates, contract v1.1).
  The red run also surfaced a pre-existing harness gap: Vitest runs separate spec files in
  parallel by default, but `auth.test.ts` and `templates.test.ts` share one Postgres test
  database that `tests/setup.ts` wipes in every `beforeEach`; running both files at once raced
  resets against inserts across files and even broke F-01 tests. Fixed by setting
  `test.fileParallelism: false` in `backend/vitest.config.ts` (`4944241`), not by changing either
  test file.

**Note on TEST-01.6:** this test reads back the `passwordHash` that the test's own `beforeEach`
wrote directly via `prisma.user.create({ ..., passwordHash: await bcrypt.hash(...) })`, and asserts
that value differs from the plaintext and verifies with `bcrypt.compare`. It therefore passes in
every run, including the very first red run, because it never calls application code (no route,
no service) — it only checks that bcrypt itself round-trips correctly. It is not evidence that the
login/seed code hashes passwords correctly; that is exercised indirectly by TEST-01.1 and
TEST-01.2a/b, which only succeed/fail correctly if `/auth/login` compares against a real bcrypt
hash.
