# F-06/F-08 — two test excerpts with real execution output

Commit: `bab69151734bbe47eb4f44cb0b33e21f76c5d488` (`feature/f08-progress-summaries`).

## 1. Domain / cross-feature rule: TEST-08.6 (F-08 reading F-06's revisions via `effectiveOn`)

File: `backend/tests/goalSummaries.test.ts`, lines 220–241 (full `it` block, lines 220–227 shown; full
block is lines 220–241):

```ts
describe("AC-08.6 a revision changes daysMet mid-window (TEST-08.6)", () => {
  it("TEST-08.6 daysMet uses the target in effect on each entry's own date", async () => {
    const G = await insertGoal(p1.id, T.id, "2026-10-01", "2026-12-31", 5);
    await insertEntry(G.id, "2026-11-01", 6);
    await insertEntry(G.id, "2026-11-02", 6);
    await insertEntry(G.id, "2026-11-03", 6);
    await insertEntry(G.id, "2026-11-04", 6);
    await insertEntry(G.id, "2026-11-05", 6);

    // Revision effective 2026-11-03, raising the target to 7.
    await start("2026-11-03T05:00:00Z");
    const revision = await patchGoal(p1Cookie, G.id, { dailyTarget: 7 });
    expect(revision.status).toBe(200);

    // Back to "today" (2026-11-12); re-login refreshes the session.
    await start();
    const res = await getSummary(p1Cookie, G.id);
    expect(res.status).toBe(200);
    expect(res.body.month).toMatchObject({ daysRecorded: 5, daysMet: 2, total: 30 });
  });
});
```

This exercises F-08's own call into F-06's `effectiveOn()` (via the shared `fetchRevisionList()` in
`backend/src/routes/entries.ts`): five entries of value 6 are recorded against a goal whose target
starts at 5, then a revision (F-06, `PATCH /goals/:id`) raises the target to 7 effective 2026-11-03.
Days 1–2 (before the revision) still compare against target 5 (met); days 3–5 compare against the
new target 7 (not met) — proving the per-day lookup, not a single scalar comparison.

Command and real output:
```
$ cd backend && npx vitest run tests/goalSummaries.test.ts -t "TEST-08.6"

 RUN  v5.1.0 /Users/asamagus/s2-wt/backend

 Test Files  1 passed (1)
      Tests  1 passed | 12 skipped (13)
   Start at  21:12:36
   Duration  1.30s (tests 71%, import 22%, setup 4%, transform 3%)
```

## 2. Access restriction (ownership/role): TEST-06.6

File: `backend/tests/goalRevisions.test.ts`, lines 238–253:

```ts
describe("AC-06.6 ownership and existence (TEST-06.6)", () => {
  it("TEST-06.6 a missing goal and another Participant's goal both return the same 404", async () => {
    await start();

    const control = await patchGoal(p1Cookie, G1.id, { dailyTarget: 8 });
    expect(control.status).toBe(200);

    const missing = await patchGoal(p1Cookie, 999999, { dailyTarget: 8 });
    expectError(missing, 404, "NOT_FOUND", GOAL404);

    const foreign = await patchGoal(p2Cookie, G1.id, { dailyTarget: 8 });
    expectError(foreign, 404, "NOT_FOUND", GOAL404);

    expect(await revisionCount()).toBe(1); // only the control call stored one
  });
});
```

This proves BR-08 (private goals): a goal id that does not exist at all, and a goal id that exists
but belongs to another Participant (P2 revising P1's goal), both return the identical 404
`NOT_FOUND` "Goal not found." — the response does not distinguish "doesn't exist" from "not yours" —
and neither rejected call stores a revision (`revisionCount()` stays at 1, from the control call only).

Command and real output:
```
$ cd backend && npx vitest run tests/goalRevisions.test.ts -t "TEST-06.6"

 RUN  v5.1.0 /Users/asamagus/s2-wt/backend

 Test Files  1 passed (1)
      Tests  1 passed | 22 skipped (23)
   Start at  21:12:38
   Duration  855ms (tests 68%, import 25%, transform 4%, setup 3%)
```
