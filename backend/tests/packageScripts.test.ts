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

  it("build's rootDir is src only, so start's dist/server.js is where tsc actually emits it", () => {
    // tsconfig.json (rootDir ".", include src+prisma+tests — used for
    // `typecheck`) mirrors that nesting under dist/, emitting
    // dist/src/server.js; "start": "node dist/server.js" silently never ran.
    // tsconfig.build.json narrows rootDir/include to "src" for the actual
    // production build so dist/ mirrors src/ one-to-one again, which also
    // keeps lib/config.ts's "../../../.env" resolution (relative to the
    // compiled file) at the same depth as it is from source.
    const pkg = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
    );
    const buildConfig = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "../tsconfig.build.json"), "utf8"),
    );

    expect(buildConfig.compilerOptions.rootDir).toBe("src");
    expect(buildConfig.include).toEqual(["src"]);
    expect(pkg.scripts.build).toBe("tsc -p tsconfig.build.json");
    expect(pkg.scripts.start).toBe(`node ${buildConfig.compilerOptions.outDir}/server.js`);
  });
});
