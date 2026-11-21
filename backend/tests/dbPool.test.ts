import { describe, expect, it, vi } from "vitest";
import { pgPool } from "../src/lib/db.js";
import { config } from "../src/lib/config.js";

describe("pgPool error handling", () => {
  it("has an error listener so an idle-connection error does not crash the process", () => {
    // Node's EventEmitter rethrows an "error" event synchronously when no
    // listener is attached — exactly the crash this guards against.
    expect(pgPool.listenerCount("error")).toBeGreaterThan(0);
  });

  it("logs only the error message (no secrets) when the pool emits an error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("synthetic idle client error");

    expect(() => pgPool.emit("error", err)).not.toThrow();

    const loggedText = spy.mock.calls.flat().map(String).join(" ");
    expect(loggedText).toContain("synthetic idle client error");
    expect(loggedText).not.toContain(config.databaseUrl);

    spy.mockRestore();
  });
});
