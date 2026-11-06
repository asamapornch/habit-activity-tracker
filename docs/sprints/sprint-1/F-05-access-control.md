# F-05 — Access-Control Tests (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-05 |
| Sprint | 1 |
| Linked requirements | BR-06, BR-08, NFR-02, NFR-05 (verifies the role and ownership rules of F-01 to F-04) |
| Depends on | F-01 (session, `requireAuth`, `requireRole`), F-02 (templates), F-03 (goals), F-04 (entries, progress) |
| Needed by | Release (these tests must pass before the release PR to `main`) |
| Owner | Student 1 |
| Reviewer | Student 2 |
| Status | Contract written before implementation |

## 1. Purpose

F-05 adds no new endpoint. It is a cross-feature safety net that proves, at the API level and
independent of the UI, that the privacy and role rules hold on every protected endpoint: a
Participant cannot read or change another Participant's goals and entries, a Manager does not
automatically gain access to private records, and a Participant cannot create or edit templates.
It also guards against a rule being weakened by a later change.

## 2. Behaviour verified

The status-code policy of the system SDS (§4) is the specification:

1. No valid session: **401** on every protected endpoint.
2. Signed in with the wrong role: **403**. This includes a Manager calling a Participant-only
   endpoint; the role gate answers before any record lookup.
3. A Participant asking for a goal (or its entries or progress) that belongs to another
   Participant, or that does not exist: **404**, with the same status, code and message in both
   cases, so existence is not revealed.
4. A Participant's own list contains only that Participant's goals.
5. Check order is always 401, then 403, then 400 (invalid input), then 404.

## 3. Test fixtures

- Test setup resets the test database before every test, so each test builds its own world in
  `beforeEach`: one Manager `M`, two Participants `P1` and `P2` (bcrypt-hashed), one template `T`,
  one goal `G1` owned by `P1`, and one entry `E1` on `G1`.
- Fixture records (template, goal, entry) are inserted directly through Prisma, not through the
  API, so F-05 does not depend on the correctness of the create endpoints.
- Sessions are obtained through the real `POST /auth/login`; the cookie is kept per user.
- Field names follow the system SDS data model: goal `{ templateId, dailyTarget, startDate,
  endDate }`, entry `{ date, value }`. If the F-03 or F-04 contract uses different names, this
  contract is updated to match before the tests are written.
- **Positive controls.** Every test that expects a rejection first asserts, in the same test, that
  the legitimate owner succeeds on the same request (200 or 201). A missing route also answers
  404, so without the control a "404 for another user's goal" test would pass vacuously before the
  feature exists.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-05.1 | Without a session every protected endpoint returns 401: `GET /templates`, `POST /templates`, `PUT /templates/:id`, `POST /goals`, `GET /goals`, `GET /goals/:id`, `POST /goals/:id/entries`, `GET /goals/:id/entries`, `GET /goals/:id/progress`. | NFR-02 |
| AC-05.2 | A Participant calling `POST /templates` or `PUT /templates/:id` receives 403, and no template is created or changed. | BR-06 |
| AC-05.3 | A Manager calling a Participant-only endpoint (`POST /goals`, `GET /goals`, `GET /goals/:id`, `POST /goals/:id/entries`, `GET /goals/:id/entries`, `GET /goals/:id/progress`) receives 403, including for an id that exists, and nothing is created or changed. | BR-08, NFR-02 |
| AC-05.4 | A Participant reading `GET /goals/:id`, `GET /goals/:id/entries` or `GET /goals/:id/progress` of another Participant's goal receives 404. | BR-08 |
| AC-05.5 | A Participant posting an entry to another Participant's goal receives 404 and no entry is created. | BR-08 |
| AC-05.6 | `GET /goals` as a Participant returns only that Participant's own goals. | BR-08 |
| AC-05.7 | Another Participant's goal id and a non-existent goal id produce identical responses (same status, code and message). | BR-08 |
| AC-05.8 | The owner of a goal can read it, its entries and its progress (200) and post an entry (201). This is the positive control for AC-05.4 and AC-05.5. | BR-08 |
| AC-05.9 | After logout, the cookie of a Participant can no longer read that Participant's own goal (401). | NFR-02 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/access.test.ts`.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-05.1a | AC-05.1 | no cookie: `GET /templates` | 401 `UNAUTHENTICATED` |
| TEST-05.1b | AC-05.1 | no cookie: `POST /templates` and `PUT /templates/:id` | 401 for each |
| TEST-05.1c | AC-05.1 | no cookie: `POST /goals`, `GET /goals`, `GET /goals/:id` | 401 for each |
| TEST-05.1d | AC-05.1 | no cookie: `POST /goals/:id/entries`, `GET /goals/:id/entries`, `GET /goals/:id/progress` | 401 for each |
| TEST-05.2a | AC-05.2 | `P1` `POST /templates` with a valid body | 403 `FORBIDDEN`; template count unchanged |
| TEST-05.2b | AC-05.2 | `P1` `PUT /templates/:id` with a valid body | 403; template unchanged |
| TEST-05.3a | AC-05.3 | `M` `GET /goals/:G1` | 403 `FORBIDDEN` (not 200, not 404) |
| TEST-05.3b | AC-05.3 | `M` `GET /goals` | 403 |
| TEST-05.3c | AC-05.3 | `M` `POST /goals` with a valid body | 403; goal count unchanged |
| TEST-05.3d | AC-05.3 | `M` `GET /goals/:G1/entries` and `GET /goals/:G1/progress` | 403 for each |
| TEST-05.3e | AC-05.3 | `M` `POST /goals/:G1/entries` with a valid body | 403; entry count unchanged |
| TEST-05.4a | AC-05.4, AC-05.8 | `P1` `GET /goals/:G1` (control) then `P2` same request | `P1` 200; `P2` 404 `NOT_FOUND` |
| TEST-05.4b | AC-05.4, AC-05.8 | `P1` `GET /goals/:G1/entries` (control) then `P2` | `P1` 200 and lists `E1`; `P2` 404 |
| TEST-05.4c | AC-05.4, AC-05.8 | `P1` `GET /goals/:G1/progress` (control) then `P2` | `P1` 200; `P2` 404 |
| TEST-05.5 | AC-05.5, AC-05.8 | `P1` `POST /goals/:G1/entries` with a valid body (control) then `P2` with a valid body for another date | `P1` 201; `P2` 404; entry count unchanged after `P2` |
| TEST-05.6 | AC-05.6 | `P2` owns a second goal `G2`; `P1` and `P2` each `GET /goals` | `P1` list has only `G1`; `P2` list has only `G2` |
| TEST-05.7 | AC-05.7 | `P2` `GET /goals/:G1` and `P2` `GET /goals/99999` | identical status, code and message |
| TEST-05.9 | AC-05.9 | `P1` logs in, logs out, replays the same cookie on `GET /goals/:G1` | 401 |

## 6. Definition of done

- [ ] This contract is committed before any test code (separate earlier commit).
- [ ] Tests TEST-05.* are committed with their failing run saved (red) before F-03 and F-04 exist or
      are merged. Tests that depend on goal or entry endpoints fail for that reason, not by error.
- [ ] After F-03 and F-04 are merged, all TEST-05.* pass (green) with the passing output saved.
- [ ] Any rule violation found by these tests is fixed in the owning feature through its own
      Issue and PR, and recorded in the evidence report.
- [ ] `npm test` in `backend/` passes from a clean checkout, including all earlier features.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Initial contract | Written before implementation |
