import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("package.json scripts", () => {
  it("has a non-interactive migrate script for deploys (Cloud Run / CI, no prompts)", () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
    );

    expect(pkg.scripts["db:migrate:deploy"]).toBe("prisma migrate deploy");
  });
});
