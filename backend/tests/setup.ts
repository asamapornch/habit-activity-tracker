import { beforeEach } from "vitest";
import { resetDb } from "./helpers/resetDb.js";

beforeEach(async () => {
  await resetDb();
});
