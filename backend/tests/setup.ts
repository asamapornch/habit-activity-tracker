import { beforeEach } from "vitest";
import "../src/lib/config.js";
import { resetDb } from "./helpers/resetDb.js";

const testUrl = process.env.DATABASE_URL_TEST;
const devUrl = process.env.DATABASE_URL;

if (!testUrl || testUrl === devUrl) {
  throw new Error(
    "DATABASE_URL_TEST must be set and different from DATABASE_URL before running tests " +
      "(refusing to risk wiping the dev database).",
  );
}

beforeEach(async () => {
  await resetDb();
});
