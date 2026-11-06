# F-02 — Activity Templates (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-02 |
| Sprint | 1 |
| Linked requirements | FR-03, FR-04, FR-05, BR-06, BR-07, NFR-02, NFR-05 |
| Depends on | F-01 (`requireAuth`, `requireRole`), database schema (`Template`) |
| Needed by | F-03, F-04, F-05 |
| Owner | Student 1 |
| Reviewer | Student 2 |
| Status | Contract written before implementation |

## 1. Purpose

Let a Manager define the activities that can be tracked (name, unit, valid value range) and change
them later. Let any logged-in user see the list so a Participant can choose a template for a goal.

## 2. Behaviour

1. **Create** (Manager only) validates the body and stores a template with the creator's user id.
2. **Update** (Manager only) replaces name, unit, minimum and maximum of an existing template.
3. **List** (any logged-in user) returns all templates.
4. Checks run in this order: no session (401), wrong role (403), invalid input (400), template
   not found (404). A Participant therefore never learns whether a template id exists when
   trying to edit it: a Participant `PUT` on an id that does not exist receives 403, not 404.
5. Changing a template's range affects only new input (SRS D-06). Existing goals and entries are
   not touched; this is verified in the F-03 and F-04 contracts, where goals and entries exist.

Rules for fields: `name` and `unit` are trimmed of leading and trailing whitespace before validation
and the **trimmed value is stored**; after trimming `name` must be 1 to 100 characters and `unit` 1 to
20 characters. `minValue` and `maxValue` must be JSON numbers (a numeric string such as `"10"` is
rejected), finite, between -1,000,000 and 1,000,000 inclusive (negative values are allowed, for
example a temperature), with at most two decimal places; `minValue` must be strictly less than
`maxValue` (BR-07). Unknown fields are rejected.

Other decisions: any Manager may update any template (Sprint 1 seeds one Manager); an update never
changes `createdById`; `GET /templates` returns templates ordered by `id` ascending. Template names are not required to be unique (not in the SRS).

Out of scope: deleting templates, archiving, per-template permissions.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /templates` | any logged-in | none | `200 [ { id, name, unit, minValue, maxValue, createdById } ]` | `401` |
| `POST /templates` | Manager | `{ name, unit, minValue, maxValue }` | `201 { id, name, unit, minValue, maxValue, createdById }` | `400`, `401`, `403` |
| `PUT /templates/:id` | Manager | `{ name, unit, minValue, maxValue }` | `200 { id, name, unit, minValue, maxValue, createdById }` | `400`, `401`, `403`, `404` |

Error body: `{ "error": { "code", "message" } }` with codes `VALIDATION_ERROR`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`. `:id` that is not a positive integer returns `400 VALIDATION_ERROR`.

### 3.2 Data

Table `Template`: `id`, `name`, `unit`, `minValue`, `maxValue`, `createdById` (foreign key to
`User`), as in the system SDS. Values are floats limited to two decimals (SRS D-07).

### 3.3 UI

Manager: a template screen with a list, a create form and an edit form; server error messages are
shown as returned. Participant: a read-only list. The UI is a convenience; the API enforces access.

## 4. Acceptance criteria

| ID | Criterion | Requirement |
| --- | --- | --- |
| AC-02.1 | A Manager creating a template with valid fields receives 201 and the stored template, including `createdById` equal to the Manager's id. | FR-03 |
| AC-02.2 | A Participant creating a template receives 403 and no template is stored. | BR-06 |
| AC-02.3 | Anonymous requests to `GET`, `POST` and `PUT` on templates receive 401. | NFR-02 |
| AC-02.4 | Creating or updating with `minValue` equal to or greater than `maxValue` returns 400. | BR-07 |
| AC-02.5 | Missing fields, an empty or whitespace-only name or unit, non-numeric values, more than two decimals, or unknown fields return 400 and nothing is stored. | NFR-05 |
| AC-02.6 | A Manager updating an existing template receives 200 with the new values, `createdById` unchanged, and a later `GET /templates` shows them. | FR-04 |
| AC-02.7 | A Participant updating a template receives 403 and the template is unchanged. | BR-06 |
| AC-02.8 | A Manager updating a template id that does not exist receives 404; an id that is not a positive integer returns 400. | NFR-05 |
| AC-02.9 | Both a Manager and a Participant calling `GET /templates` receive 200 with all stored templates. | FR-05 |
| AC-02.10 | A Participant updating a template id that does not exist receives 403 (not 404), so existence is not revealed. | BR-06, NFR-02 |
| AC-02.11 | Template `name` and `unit` are trimmed and stored trimmed; a name over 100 or a unit over 20 characters (after trimming) returns 400. | NFR-05 |
| AC-02.12 | A numeric string, a non-finite number, or a value outside -1,000,000 to 1,000,000 returns 400. | NFR-05 |

## 5. Software test specification (STS)

All tests are API-level (Vitest + Supertest) in `backend/tests/templates.test.ts`. Each test creates
its own Manager and Participant in `beforeEach` (bcrypt-hashed) and logs in through the real
`POST /auth/login` from F-01, keeping the cookie. The shared setup resets the test database before
every test.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-02.1a | AC-02.1 | Manager `POST /templates` with `{ "Running", "km", 0, 50 }` | 201; body matches input; `createdById` equals Manager id |
| TEST-02.1b | AC-02.11 | Manager `POST` with name `"  Running  "` and unit `" km "` | 201; stored name `"Running"` and unit `"km"` |
| TEST-02.2 | AC-02.2 | Participant `POST /templates` with a valid body | 403 `FORBIDDEN`; the template table is empty |
| TEST-02.3a | AC-02.3 | no cookie, `GET /templates` | 401 `UNAUTHENTICATED` |
| TEST-02.3b | AC-02.3 | no cookie, `POST /templates` | 401 |
| TEST-02.3c | AC-02.3 | no cookie, `PUT /templates/1` | 401 |
| TEST-02.4a | AC-02.4 | Manager `POST` with `minValue` 10, `maxValue` 10 | 400 `VALIDATION_ERROR` |
| TEST-02.4b | AC-02.4 | Manager `POST` with `minValue` 20, `maxValue` 5 | 400 |
| TEST-02.4c | AC-02.4 | Manager `PUT` an existing template with `minValue` 9, `maxValue` 3 | 400; template unchanged |
| TEST-02.5a | AC-02.5 | Manager `POST` with `{}` | 400; nothing stored |
| TEST-02.5b | AC-02.5 | Manager `POST` with name `"   "` | 400 |
| TEST-02.5c | AC-02.5 | Manager `POST` with `minValue` `"abc"` | 400 |
| TEST-02.5d | AC-02.5 | Manager `POST` with `maxValue` 10.123 | 400 |
| TEST-02.5e | AC-02.5 | Manager `POST` with an extra field `"colour"` | 400 |
| TEST-02.5f | AC-02.11 | Manager `POST` with a 101-character name | 400 |
| TEST-02.5g | AC-02.11 | Manager `POST` with a 21-character unit | 400 |
| TEST-02.5h | AC-02.12 | Manager `POST` with `minValue` `"10"` (string) | 400 |
| TEST-02.5i | AC-02.12 | Manager `POST` with `maxValue` 1000001 | 400 |
| TEST-02.5j | AC-02.1 | Manager `POST` with `minValue` -20, `maxValue` 50 | 201 (negative values allowed) |
| TEST-02.6a | AC-02.6 | Manager creates, then `PUT` new values, then `GET /templates` | PUT 200 with new values; `createdById` unchanged; GET shows them |
| TEST-02.6b | AC-02.6 | Manager A creates; a second Manager B (created in the test) `PUT`s it | 200; `createdById` still A's id |
| TEST-02.7 | AC-02.7 | Manager creates; Participant `PUT` | 403; a later read shows the old values |
| TEST-02.8a | AC-02.8 | Manager `PUT /templates/99999` with a valid body | 404 `NOT_FOUND` |
| TEST-02.8b | AC-02.8 | Manager `PUT /templates/abc` | 400 |
| TEST-02.8c | AC-02.10 | Participant `PUT /templates/99999` with a valid body | 403 `FORBIDDEN` (not 404) |
| TEST-02.9a | AC-02.9 | Two templates exist; Manager `GET /templates` | 200; list has both, ordered by `id` ascending |
| TEST-02.9b | AC-02.9 | same, as Participant | 200; list has both |

## 6. Definition of done

- [ ] This contract is committed before any implementation code (separate earlier commit).
- [ ] Tests TEST-02.* are committed and fail first (red), with the failing output saved.
- [ ] Implementation makes all TEST-02.* pass (green), with the passing output saved.
- [ ] `npm test` in `backend/` passes from a clean checkout, including all F-01 tests.
- [ ] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [ ] Failed or skipped tests, if any, are listed in the evidence report.
- [ ] `NOT_FOUND` is added to the shared `ErrorCode` type used by the error handler.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Initial contract | Written before implementation |
| 1.1 | 2026-11-06 | Participant PUT on a missing id returns 403 (AC-02.10); trimming and length limits, numeric limits and string rejection (AC-02.11, AC-02.12); any Manager may update, `createdById` unchanged, list ordered by id; `NOT_FOUND` added to `ErrorCode` | PR #11 review |
