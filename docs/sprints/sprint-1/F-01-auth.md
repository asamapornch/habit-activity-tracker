# F-01 — Authentication and Roles (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-01 |
| Sprint | 1 |
| Linked requirements | FR-01, FR-02, NFR-01, NFR-02, NFR-05 (also supports BR-06, BR-08 by providing role and identity) |
| Depends on | Repository skeleton, database schema (`User`), seed script |
| Needed by | F-02, F-03, F-04, F-05 |
| Owner | Student 1 |
| Reviewer | Student 2 |
| Status | Contract written before implementation |

## 1. Purpose

Let a seeded user log in with email and password, stay identified by a server-side session, log out,
and let the rest of the system know who the user is and which role they have. Provide the shared
middleware that protects every other endpoint.

## 2. Behaviour

1. **Login** validates the request body, finds the user by email, compares the password with the
   stored bcrypt hash, and on success creates a server-side session holding the user id and role.
   The response sets an HTTP-only session cookie and returns the user's id, email and role.
2. **Failed login** (unknown email or wrong password) returns the same generic 401 for both cases so
   an attacker cannot tell which part was wrong.
3. **Logout** destroys the server-side session and clears the cookie. A request that later presents
   the old cookie is treated as not logged in.
4. **Current user** returns the identity of the session owner.
5. **`requireAuth`** rejects requests with no valid session (401).
6. **`requireRole(role)`** rejects an authenticated user whose role differs (403).

Out of scope: self-registration, password reset, account lockout, "remember me".

## 3. Interface specification

### 3.1 API

| Endpoint | Request body | Success | Errors |
| --- | --- | --- | --- |
| `POST /auth/login` | `{ "email": string, "password": string }` | `200 { "id": number, "email": string, "role": "MANAGER" or "PARTICIPANT" }` and sets session cookie | `400` missing or non-string fields; `401` wrong credentials |
| `POST /auth/logout` | none | `200 { "message": "logged out" }` and clears cookie | `401` no valid session |
| `GET /auth/me` | none | `200 { "id", "email", "role" }` | `401` no valid session |

Error body for every error: `{ "error": { "code": "<CODE>", "message": "<text>" } }` with codes
`VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `FORBIDDEN`.

The response never contains `passwordHash`.

### 3.2 Data

Table `User` (already created by the initial migration): `id`, `email` (unique), `passwordHash`,
`role`. Seed creates one Manager and two Participants; their passwords come from environment
variables (`SEED_*`), never from source code.

### 3.3 UI

A login screen with email and password fields and a submit button. On `401` it shows the server's
message; on success it shows the signed-in email and role and a Logout button. The UI is a
convenience only; the API enforces access (NFR-02).

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-01.1 | Logging in with a correct email and password returns 200 with id, email and role, and sets a session cookie. | FR-01 |
| AC-01.2 | Logging in with a wrong password, or with an unknown email, returns 401 with the same generic error code and message in both cases. | FR-01, NFR-05 |
| AC-01.3 | After logout, `GET /auth/me` using the same cookie returns 401. | FR-02 |
| AC-01.4 | Calling a protected endpoint with no session returns 401. | NFR-02 |
| AC-01.5 | A Participant calling an endpoint guarded by `requireRole("MANAGER")` receives 403, and a Manager receives access. | NFR-02 |
| AC-01.6 | The stored `passwordHash` is not equal to the plaintext password and verifies with bcrypt. | NFR-01 |
| AC-01.7 | Logging in with a missing `email` or `password`, or non-string values, returns 400 and does not crash the server. | NFR-05 |
| AC-01.8 | `GET /auth/me` while logged in returns the same id, email and role as the login response, and no `passwordHash`. | FR-02 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/auth.test.ts`. A throwaway
route guarded by `requireAuth` and one guarded by `requireRole("MANAGER")` is registered inside the
test file to exercise the middleware before F-02 exists. Tests use the seeded accounts and the test
database.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-01.1 | AC-01.1 | `POST /auth/login` with seeded manager credentials | 200; body has `id`, `email`, `role = MANAGER`; `Set-Cookie` present |
| TEST-01.2a | AC-01.2 | login with correct email, wrong password | 401, code `INVALID_CREDENTIALS` |
| TEST-01.2b | AC-01.2 | login with unknown email | 401, same code and message as TEST-01.2a |
| TEST-01.3 | AC-01.3 | login, then `POST /auth/logout`, then `GET /auth/me` with the same cookie | logout 200; `/auth/me` 401 |
| TEST-01.4 | AC-01.4 | request the `requireAuth` test route with no cookie | 401, code `UNAUTHENTICATED` |
| TEST-01.5a | AC-01.5 | log in as a Participant, call the manager-only test route | 403, code `FORBIDDEN` |
| TEST-01.5b | AC-01.5 | log in as the Manager, call the manager-only test route | 200 |
| TEST-01.6 | AC-01.6 | read the seeded user's `passwordHash` from the test database | differs from the plaintext; bcrypt compare returns true |
| TEST-01.7a | AC-01.7 | `POST /auth/login` with `{}` | 400, code `VALIDATION_ERROR` |
| TEST-01.7b | AC-01.7 | `POST /auth/login` with `{ "email": 123, "password": null }` | 400; server still answers a later request |
| TEST-01.8 | AC-01.8 | login, then `GET /auth/me` | 200; id, email, role equal the login response; no `passwordHash` key |

## 6. Definition of done

- [ ] This contract is committed before any implementation code (separate earlier commit).
- [ ] Tests TEST-01.* are committed and fail first (red), with the failing output saved.
- [ ] Implementation makes all TEST-01.* pass (green), with the passing output saved.
- [ ] `npm test` in `backend/` passes from a clean checkout.
- [ ] No secrets are committed; seeded passwords come from environment variables.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, and is
      reviewed and approved by the other student with comments describing what was checked.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Initial contract | Written before implementation |
