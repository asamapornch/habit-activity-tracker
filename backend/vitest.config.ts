import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: { NODE_ENV: "test" },
    setupFiles: ["./tests/setup.ts"],
    exclude: ["node_modules", "dist"],
    // All spec files share one Postgres test database that setup.ts wipes in
    // beforeEach; running files in parallel races resets against inserts
    // across files, so they must run one file at a time.
    fileParallelism: false,
  },
});
