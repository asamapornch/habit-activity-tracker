# Lab 5 — Cloud-ready app contract

What changed in this PR to make the app deployable on Google Cloud Run as a single
container, single origin, and why. Each change was driven by a test written first
(see `docs/labs/lab-05/evidence/` for the red-then-green output).

## 1. Sessions moved from in-memory to Postgres

**Why:** Cloud Run can run several instances of the same container and route a
browser's requests to any of them. The previous `express-session` default
(`MemoryStore`) keeps sessions in that one process's RAM, so a user who logs in
against instance A and gets routed to instance B on their next request would
suddenly look logged out.

**What:** `backend/src/lib/session.ts` now uses `connect-pg-simple`, backed by a
shared `pg.Pool` (new file `backend/src/lib/db.ts`) pointed at the same database
as Prisma. One additive migration
(`backend/prisma/migrations/20261119164352_add_session_table/`) creates the
`session` table connect-pg-simple expects (`sid`, `sess`, `expire`); no existing
table is touched. `schema.prisma` gets a matching `Session` model marked
`@@ignore` purely so `prisma migrate dev` sees no drift later — the app never
reads/writes that table through Prisma Client, only through connect-pg-simple's
own queries.

## 2. `trust proxy` + confirmed cookie flags

**Why:** Cloud Run terminates TLS and forwards the request over plain HTTP with
an `X-Forwarded-Proto` header. Express doesn't trust that header by default, so
`req.secure` is always `false` unless told otherwise — which matters because the
session cookie's `secure: true` in production silently drops the cookie entirely
on a request Express doesn't consider secure (that's documented `express-session`
behaviour, not a bug).

**What:** `app.set("trust proxy", 1)` in `backend/src/app.ts`, trusting exactly
one hop (Cloud Run's own front-end), not an arbitrary chain. The cookie flags
that were already correct (`HttpOnly`, `SameSite=Lax`, `Secure` only in
production) are now locked in by a test.

## 3. `GET /ready`

**Why:** `GET /health` only proves the Node process is up; Cloud Run (and any
orchestrator) also needs to know whether the app can actually serve traffic,
i.e. whether the database is reachable.

**What:** `backend/src/routes/ready.ts` runs `SELECT 1` through Prisma; 200
`{"status":"ready"}` on success, 503 `{"status":"not ready"}` on failure.
`/health` is unchanged.

## 4. `db:migrate:deploy`

**Why:** `db:migrate` runs `prisma migrate dev`, which can prompt interactively
(e.g. to name a migration or confirm a reset) — unusable in CI or a Cloud Run
deploy step. `prisma migrate deploy` only applies already-generated migration
files and never prompts.

**What:** added `"db:migrate:deploy": "prisma migrate deploy"` to
`backend/package.json`.

## 5. Single-origin: Express serves the built frontend, SPA fallback

**Why:** the goal is one container, one origin — no separate CORS-exposed
frontend origin in production.

**What:** `backend/src/lib/staticFrontend.ts` exports `mountFrontend(app,
distDir)`, called at the very end of `createApp()` (`backend/src/app.ts`), after
every API router. It's a no-op unless `distDir/index.html` exists — which it
doesn't in local dev (the frontend runs via its own Vite dev server there), only
in the built production image. When it does exist: `express.static(distDir)`
serves built assets, and a final `app.get("*", ...)` serves `index.html` for any
other GET — **except** a path under one of the backend's own route prefixes
(`/health`, `/ready`, `/auth`, `/templates`, `/goals` — note these are **not**
namespaced under `/api`), which gets the API's own JSON 404 instead. That
prefix list is the one place that has to know all of them, precisely because
the backend doesn't use an `/api` namespace; a future route added without
updating this list would get swallowed by the SPA fallback instead of 404ing
as JSON.

**`FRONTEND_ORIGIN` / CORS in production:** once Express serves the frontend
itself, the browser's requests to `/auth/login` etc. are same-origin — no CORS
preflight, no `Access-Control-Allow-Origin` header needed at all for the app to
work. **This PR does not change `cors.ts` or its fail-fast behavior.**
`FRONTEND_ORIGIN` still must be set (the app still refuses to start otherwise),
and in the single-origin deployment it should be set to the Cloud Run service's
own public URL (not a separate frontend host) — CORS then just allows
same-origin requests, which is harmless and keeps the fail-fast safety net (if
someone forgets to set it, the app still won't boot) without requiring a second
code path for "no CORS needed." Changing `cors.ts` to skip CORS setup entirely
in single-origin mode is a reasonable follow-up but is a behavior change I did
not make without your sign-off.

**Known limitation:** a few existing test files (`auth.test.ts`,
`sessionCookie.test.ts`) build their test app by calling `createApp()` and then
adding extra `/__test/*` routes afterward. Since `mountFrontend`'s catch-all is
registered inside `createApp()`, those routes are added *after* it — if
`frontend/dist` happens to exist on disk when those tests run (e.g. someone ran
`npm run build` in `frontend/` locally first), the SPA fallback shadows
`/__test/*` and those tests fail. This doesn't affect production (nothing is
added to the app after `createApp()` returns there) or normal `npm test` runs
(no local frontend build present). Found and confirmed via manual end-to-end
testing — see `evidence/09-production-manual-verification.txt`.

## 6. Env hygiene

- `PORT` was already read from `process.env.PORT` (default 4000) — Cloud Run
  sets this itself, no change needed.
- `.env.example` already had placeholder-only values — no change needed.
- `.gitignore`: broadened `.env.*.local` to `.env.*` (still excepting
  `.env.example`), so any local `.env.<something>` variant is ignored, not just
  the `.local` suffix.
- `README.md`'s example `SESSION_SECRET` value now matches `.env.example`'s
  unmistakably-a-placeholder wording (`replace-with-a-long-random-string`)
  instead of a more realistic-looking sample string.

## An unrelated bug this PR's own verification caught and fixed

While verifying item 5 end-to-end against a real `npm run build`, `npm start`
crashed — `backend/tsconfig.json` has `rootDir: "."` and
`include: ["src", "prisma", "tests"]`, so `tsc` mirrors that nesting under
`dist/`, emitting `dist/src/server.js`, not `dist/server.js`. `"start": "node
dist/server.js"` had therefore never actually run successfully, on `main` or
`sprint-1-staging`, independent of anything in this PR. Fixed with a new
`backend/tsconfig.build.json` (`rootDir`/`include` narrowed to `"src"`) that the
`build` script now uses, which also restores `dist/` to mirror `src/` one level
shallower than before — fixing a second, related issue: `lib/config.ts`'s
`.env` path is resolved relative to the compiled file, and the extra `dist/src/`
nesting had made that resolve one directory too high, so `SESSION_SECRET` (and
every other env var) silently failed to load at runtime. A new `typecheck`
script (`tsc -p tsconfig.json --noEmit`) preserves the original full
type-checking coverage over `tests/` and `prisma/` without emitting them into
the production image.
