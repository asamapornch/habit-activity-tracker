import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("trust proxy", () => {
  it("trusts exactly one proxy hop (Cloud Run's front-end load balancer)", () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(1);
  });
});
