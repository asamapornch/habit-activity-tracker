import { describe, expect, it } from "vitest";
import { effectiveOn } from "../src/lib/goalRevisions.js";

// TEST-06.14 (F-06 contract §5, Decision D-15): pure-function unit level,
// no database. Fabricated revision lists only.

const GOAL = { dailyTarget: 5, endDate: "2026-11-30" };
const D = "2026-11-15";

describe("AC-06.12 effectiveOn (TEST-06.14)", () => {
  it("returns the goal's own value when no revision qualifies", () => {
    expect(effectiveOn(GOAL, [], D, "dailyTarget")).toBe(5);
  });

  it("returns the qualifying revision's value when one revision is before D", () => {
    const revisions = [{ id: 1, dailyTarget: 8, endDate: "2026-12-15", effectiveFrom: "2026-11-10" }];
    expect(effectiveOn(GOAL, revisions, D, "dailyTarget")).toBe(8);
  });

  it("returns the later-effectiveFrom revision's value when one is before D and one after", () => {
    const revisions = [
      { id: 1, dailyTarget: 8, endDate: "2026-12-15", effectiveFrom: "2026-11-10" },
      { id: 2, dailyTarget: 12, endDate: "2026-12-20", effectiveFrom: "2026-11-20" },
    ];
    expect(effectiveOn(GOAL, revisions, D, "dailyTarget")).toBe(8);
  });

  it("returns the higher-id revision's value when two revisions share effectiveFrom (D-14 tie-break)", () => {
    const revisions = [
      { id: 1, dailyTarget: 8, endDate: "2026-12-15", effectiveFrom: "2026-11-10" },
      { id: 2, dailyTarget: 9, endDate: "2026-12-16", effectiveFrom: "2026-11-10" },
    ];
    expect(effectiveOn(GOAL, revisions, D, "dailyTarget")).toBe(9);
  });

  it("works for the endDate field the same way", () => {
    const revisions = [{ id: 1, dailyTarget: 8, endDate: "2026-12-15", effectiveFrom: "2026-11-10" }];
    expect(effectiveOn(GOAL, revisions, D, "endDate")).toBe("2026-12-15");
    expect(effectiveOn(GOAL, [], D, "endDate")).toBe("2026-11-30");
  });
});
