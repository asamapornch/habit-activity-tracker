import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      // Keep the suite independent of whether a real frontend/dist happens
      // to exist on disk (e.g. from a local `npm run build`) — tests for
      // mountFrontend pass their own fixture dirs directly; everything else
      // (including /__test/* routes some files append to createApp()'s
      // result) should see it as a no-op, same as it is in normal dev.
      FRONTEND_DIST_PATH: "/__lab5_no_frontend_dist__",
    },
    setupFiles: ["./tests/setup.ts"],
    exclude: ["node_modules", "dist"],
    // All spec files share one Postgres test database that setup.ts wipes in
    // beforeEach; running files in parallel races resets against inserts
    // across files, so they must run one file at a time.
    fileParallelism: false,
  },
});
