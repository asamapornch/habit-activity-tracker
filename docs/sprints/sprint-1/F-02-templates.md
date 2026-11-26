# F-02 — Activity Templates (Engineering Contract)

| Item | Value |
| --- | --- |
| Feature ID | F-02 |
| Sprint | 1 |
| Linked requirements | FR-03, FR-04, FR-05, BR-06, BR-07, NFR-02, NFR-05; SRS D-12 (Lab 7) |
| Depends on | F-01 (`requireAuth`, `requireRole`), database schema (`Template`) |
| Needed by | F-03, F-04, F-05 |
| Owner | Student 1 |
| Reviewer | Student 2 |
| Status | Implemented and merged into `sprint-1-staging` (PR #11, #12, #14, #21). v1.6: Lab 7 back-dating limit specified (Issue #65), implementation pending |

## 1. Purpose

Let a Manager define the activities that can be tracked (name, unit, valid value range) and change
them later. Let any logged-in user see the list so a Participant can choose a template for a goal.

## 2. Behaviour

1. **Create** (Manager only) validates the body and stores a template with the creator's user id.
2. **Update** (Manager only) replaces name, unit, minimum, maximum and back-dating limit of an
   existing template.
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

**Back-dating limit (v1.6, Lab 7, SRS D-12).** `backdateDays` is an optional key on create and update.
Its value is a JSON integer from 0 to 30 inclusive, or `null`. Leaving the key out stores `null`, and so
does sending `null`; because `PUT` replaces every field, a `PUT` without the key clears an existing
limit. Anything else is rejected with the same 400 as other invalid fields: a negative number, a
number above 30, a non-integer such as 2.5, a numeric string such as `"7"`, a boolean. `null` means no
limit (the Sprint 1 behaviour); every template that existed before this change has `null`. The limit is
enforced when an entry is recorded (F-04 v1.5, BR-03); changing it never changes existing entries
(SRS D-12, same idea as D-06). Only a Manager can set it, through the same Manager-only endpoints
(BR-06); a Participant still receives 403 whatever the body contains.

Other decisions: any Manager may update any template (Sprint 1 seeds one Manager); an update never
changes `createdById`; `GET /templates` returns templates ordered by `id` ascending. Template names are not required to be unique (not in the SRS).

Out of scope: deleting templates, archiving, per-template permissions.

## 3. Interface specification

### 3.1 API

| Endpoint | Role | Request body | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET /templates` | any logged-in | none | `200 [ { id, name, unit, minValue, maxValue, backdateDays, createdById } ]` | `401` |
| `POST /templates` | Manager | `{ name, unit, minValue, maxValue, backdateDays? }` | `201 { id, name, unit, minValue, maxValue, backdateDays, createdById }` | `400`, `401`, `403` |
| `PUT /templates/:id` | Manager | `{ name, unit, minValue, maxValue, backdateDays? }` | `200 { id, name, unit, minValue, maxValue, backdateDays, createdById }` | `400`, `401`, `403`, `404` |

`backdateDays?` marks the optional key (v1.6). In responses `backdateDays` is always present, as an
integer or `null`.

Error body: `{ "error": { "code", "message" } }` with codes `VALIDATION_ERROR`, `UNAUTHENTICATED`,
`FORBIDDEN`, `NOT_FOUND`. `:id` that is not a positive integer returns `400 VALIDATION_ERROR`.
An invalid `backdateDays` uses the existing messages: `Invalid template fields.` on `POST`,
`Invalid template id or fields.` on `PUT` (no new message).

### 3.2 Data

Table `Template`: `id`, `name`, `unit`, `minValue`, `maxValue`, `backdateDays`, `createdById` (foreign
key to `User`), as in the system SDS. Values are floats limited to two decimals (SRS D-07).

v1.6: one Prisma migration adds `backdateDays` as a nullable integer column with no default. Existing
rows get `NULL` (no limit), so no data is rewritten and the Sprint 1 behaviour of existing templates is
unchanged. No other table changes.

### 3.3 UI

Manager: a template screen with a list, a create form and an edit form; server error messages are
shown as returned. Participant: a read-only list. The UI is a convenience; the API enforces access.
While the list is being fetched a loading message is shown; if the request fails an error message
is shown instead of an endless loading state. The create/edit submit button is disabled while a
request is in flight. A server validation error on create or update is shown with the server's
message verbatim and the form keeps whatever the user typed (it is not cleared). A `401` from any
template request returns the user to the login screen (the session has ended).

v1.6: the create and edit forms have a field labelled **Back-dating limit (days)** (a number input,
step 1, 0 to 30, not required; the label does not contain "min" or "max", so it does not clash with
the existing Min value / Max value fields). Empty sends `backdateDays: null`; a typed number is sent as
a JSON integer. The edit form is pre-filled with the current limit (empty when `null`). The list shows
`· back-dating N days` after the range when a template has a limit, and nothing extra when it is
`null` (a response without the key is treated the same way), so existing list text is unchanged. The UI does not validate the range itself; a 400 is shown
verbatim (AC-02.17).

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
| AC-02.8 | A Manager updating a template id that does not exist receives 404; an id that is not a positive integer, or is greater than 2147483647, returns 400. | NFR-05 |
| AC-02.9 | Both a Manager and a Participant calling `GET /templates` receive 200 with all stored templates. | FR-05 |
| AC-02.10 | A Participant updating a template id that does not exist receives 403 (not 404), so existence is not revealed. | BR-06, NFR-02 |
| AC-02.11 | Template `name` and `unit` are trimmed and stored trimmed; a name over 100 or a unit over 20 characters (after trimming) returns 400. | NFR-05 |
| AC-02.12 | A numeric string, a non-finite number, or a value outside -1,000,000 to 1,000,000 returns 400. | NFR-05 |
| AC-02.13 | A signed-in user sees the template list; a loading message is shown while it is fetched, and an error message if the request fails. | FR-05 |
| AC-02.14 | A Participant sees the list only, with no create or edit controls. | BR-06 |
| AC-02.15 | A Manager sees a create form and an edit control for each template. | FR-03, FR-04 |
| AC-02.16 | A Manager creating a valid template sends `POST /templates`, and the new template appears in the list. | FR-03 |
| AC-02.17 | A server validation error (400) on create or update is shown with the server's message verbatim, and the form keeps what was typed. | NFR-05 |
| AC-02.18 | A Manager editing a template sees the form pre-filled with its current values, sends `PUT /templates/:id`, and the list shows the new values. | FR-04 |
| AC-02.19 | A `401` from any template request returns the user to the login screen. | NFR-02 |
| AC-02.20 | The submit button is disabled while a create or update request is in flight. | NFR-05 |
| AC-02.21 | A Manager creating a template with `backdateDays` 7 receives 201 with `backdateDays` 7 stored; the limits 0 and 30 are accepted; leaving the key out or sending `null` stores `null`. | FR-03, D-12 |
| AC-02.22 | `backdateDays` -1, 31, 2.5, `"7"` or `true` on `POST` or `PUT` returns 400 with the existing message, and nothing is stored or changed. | NFR-05, D-12 |
| AC-02.23 | A Manager can change a template's limit (7 to 3) and clear it (a `PUT` without the key, or with `null`); each returns 200 with the new value, `createdById` unchanged, and a later `GET /templates` shows it. | FR-04, D-12 |
| AC-02.24 | `GET /templates` returns `backdateDays` for every template, to a Manager and a Participant: the integer when set and `null` otherwise. | FR-05, D-12 |
| AC-02.25 | A Participant `POST` or `PUT` with `backdateDays` receives 403 and nothing is stored or changed. | BR-06, D-12 |
| AC-02.26 | The create and edit forms have a "Back-dating limit (days)" field: empty sends `backdateDays: null`, a number is sent as a JSON integer, and the edit form is pre-filled with the current limit. | FR-03, FR-04, D-12 |
| AC-02.27 | The list shows "back-dating N days" for a template with a limit and nothing extra for a template without one. | FR-05, D-12 |

## 5. Software test specification (STS)

### 5.1 Backend tests

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
| TEST-02.8d | AC-02.8 | Manager `PUT /templates/99999999999` (exceeds Postgres's 32-bit `integer` range) | 400 `VALIDATION_ERROR`, not 500 |
| TEST-02.9a | AC-02.9 | Two templates exist; Manager `GET /templates` | 200; list has both, ordered by `id` ascending |
| TEST-02.9b | AC-02.9 | same, as Participant | 200; list has both |
| TEST-02.21a | AC-02.21 | Manager `POST` `{ "Running", "km", 0, 50, backdateDays: 7 }` | 201; body `backdateDays` 7; stored row `backdateDays` 7 |
| TEST-02.21b | AC-02.21 | Manager `POST` with `backdateDays` 0, then another with 30 | 201 for each; stored 0 and 30 |
| TEST-02.21c | AC-02.21 | Manager `POST` without the key, then another with `backdateDays: null` | 201 for each; body and stored row `backdateDays` `null` |
| TEST-02.22a | AC-02.22 | Manager `POST` with `backdateDays` -1, 31, 2.5, `"7"`, `true` (one request each) | 400 `VALIDATION_ERROR` `Invalid template fields.` for each; template table empty |
| TEST-02.22b | AC-02.22 | Manager creates a template with `backdateDays` 7; `PUT` it with `backdateDays` 31, then `"7"` | 400 `VALIDATION_ERROR` `Invalid template id or fields.` for each; stored template unchanged (`backdateDays` 7) |
| TEST-02.23a | AC-02.23 | Manager creates with `backdateDays` 7; `PUT` the same fields with `backdateDays` 3; `GET /templates` | PUT 200 with `backdateDays` 3, `createdById` unchanged; GET shows 3 |
| TEST-02.23b | AC-02.23 | Manager creates with `backdateDays` 3; `PUT` without the key; then creates another with 5 and `PUT`s it with `backdateDays: null` | 200 for each; both now `backdateDays` `null` |
| TEST-02.24 | AC-02.24 | Templates with `backdateDays` 7 and without the key exist; Manager and Participant `GET /templates` | 200 for each; the first has `backdateDays` 7, the second `null` |
| TEST-02.25a | AC-02.25 | Participant `POST /templates` with a valid body plus `backdateDays: 7` | 403 `FORBIDDEN`; template table empty |
| TEST-02.25b | AC-02.25 | Manager creates without a limit; Participant `PUT` it with `backdateDays: 1` | 403 `FORBIDDEN`; stored `backdateDays` still `null` |

### 5.2 Frontend tests

Component tests (Vitest + React Testing Library) in `frontend/src/Templates.test.tsx`, with `fetch`
mocked per test.

| Test ID | Covers | Input | Expected result |
| --- | --- | --- | --- |
| TEST-02.13 | AC-02.13 | (a) `GET /templates` left pending; (b) `GET /templates` rejected | (a) a loading message is shown before the list appears; (b) an error message is shown, not an endless loading state |
| TEST-02.14 | AC-02.14 | render as a signed-in Participant, `GET /templates` returns a list | the list is shown; no create form and no edit control is present |
| TEST-02.15 | AC-02.15 | render as a signed-in Manager, `GET /templates` returns a list | a create form is shown; each list row has an edit control |
| TEST-02.16 | AC-02.16 | Manager fills the create form with valid fields and submits | `POST /templates` is called with that body; the new template appears in the list |
| TEST-02.16b | AC-02.16 | Manager types `0.5` in Min value and `2.25` in Max value and submits | `POST /templates` is called with `minValue: 0.5` and `maxValue: 2.25` as JSON numbers (not strings); succeeds |
| TEST-02.17 | AC-02.17 | Manager submits the create form; `POST /templates` mocked to 400 with a given `error.message` | that exact message is shown; the fields still hold what was typed |
| TEST-02.17b | AC-02.17 | Manager opens the edit control, changes a value, submits; `PUT /templates/:id` mocked to 400 with a given `error.message` | that exact message is shown; the edit form keeps the values the Manager had typed (it is not closed or reset) |
| TEST-02.18 | AC-02.18 | Manager opens the edit control for an existing template, changes a value, submits | the form is pre-filled with the template's current values before editing; `PUT /templates/:id` is called; the list shows the new values |
| TEST-02.19 | AC-02.19 | rendered through the signed-in view (`SignedInView`/`App`, not `Templates` standalone), any template request mocked to 401 | the login form is shown (the app returns to the signed-out view) |
| TEST-02.20 | AC-02.20 | Manager submits the create form; `POST /templates` left pending | the submit button is disabled until the request resolves |
| TEST-02.26a | AC-02.26 | Manager fills the create form, types `7` in "Back-dating limit (days)" and submits | `POST /templates` body has `backdateDays: 7` as a JSON number |
| TEST-02.26b | AC-02.26 | Manager fills the create form, leaves "Back-dating limit (days)" empty and submits | `POST /templates` body has `backdateDays: null` |
| TEST-02.26c | AC-02.26 | Manager opens the edit control of a template with `backdateDays` 5, changes it to 2 and saves | the field is pre-filled with `5`; `PUT /templates/:id` body has `backdateDays: 2` |
| TEST-02.27 | AC-02.27 | `GET /templates` returns one template with `backdateDays` 7 and one with `null` | the first row shows `back-dating 7 days`; the second row's text has no "back-dating" |

## 6. Definition of done

- [x] This contract is committed before any implementation code (separate earlier commit).
- [x] Tests TEST-02.* are committed and fail first (red), with the failing output saved.
- [x] Implementation makes all TEST-02.* pass (green), with the passing output saved.
- [x] `npm test` in `backend/` passes from a clean checkout, including all F-01 tests.
- [x] Pull request into `sprint-1-staging` is linked to this contract and its Issue, reviewed and
      approved by the other student with comments describing what was checked.
- [x] Failed or skipped tests, if any, are listed in the evidence report.
- [x] `NOT_FOUND` is added to the shared `ErrorCode` type used by the error handler.
- [ ] (v1.6, Lab 7) TEST-02.21 to TEST-02.27 are committed and fail first (red) on the pre-change code
      `5d0e4ba` because the limit is missing (assertion failures, not compile or setup errors), with the
      output saved under `docs/labs/lab-07/evidence/`.
- [ ] (v1.6) The migration and implementation make them pass (green); all existing TEST-01 to TEST-05
      pass without editing any existing expected result; outputs saved.
- [ ] (v1.6) Pull request into `sprint-1-staging` with `Refs #65`, reviewed and approved by Student 2.

## 7. Version history

| Version | Date | Change | Reason |
| --- | --- | --- | --- |
| 1.0 | 2026-11-06 | Initial contract | Written before implementation |
| 1.1 | 2026-11-06 | Participant PUT on a missing id returns 403 (AC-02.10); trimming and length limits, numeric limits and string rejection (AC-02.11, AC-02.12); any Manager may update, `createdById` unchanged, list ordered by id; `NOT_FOUND` added to `ErrorCode` | PR #11 review |
| 1.2 | 2026-11-06 | AC-02.8 now also rejects an id greater than 2147483647 (Postgres's 32-bit `integer` max) with 400, instead of letting it reach the database and surface as 500; added TEST-02.8d | PR #12 review |
| 1.3 | 2026-11-07 | Added AC-02.13 to AC-02.20 and TEST-02.13 to TEST-02.20 (§5.2, frontend component tests): list with loading/error states, role-based controls, create/edit flows, verbatim validation errors with the form preserved, 401 returns to login, disabled submit button while in flight | template UI |
| 1.4 | 2026-11-07 | Added TEST-02.16b (decimal Min/Max values sent as JSON numbers) and TEST-02.17b (verbatim 400 message and preserved values on update, not just create); clarified TEST-02.19 to render through the signed-in view rather than `Templates` standalone | PR #21 review |
| 1.5 | 2026-11-07 | Status set to implemented; Definition of done checked against the merged PRs and saved evidence (no change to behaviour, AC or tests) | Part B/D, Sprint 1 close-out |
| 1.6 | 2026-11-26 | Optional `backdateDays` (0 to 30 or `null`) on create, update and list; nullable column migration; form field and list text; AC-02.21 to AC-02.27, TEST-02.21a to TEST-02.27. Existing AC and tests unchanged | Lab 7 change request, Issue #65 (SRS v1.2, D-12) |
