import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env") });

const isTest = process.env.NODE_ENV === "test";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  sessionSecret: process.env.SESSION_SECRET ?? "",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "",
  databaseUrl: isTest
    ? process.env.DATABASE_URL_TEST ?? ""
    : process.env.DATABASE_URL ?? "",
  // The single-container production image builds the frontend to
  // frontend/dist (see mountFrontend in lib/staticFrontend.ts); in local dev
  // that directory doesn't exist and mountFrontend is a no-op.
  frontendDistPath: path.resolve(import.meta.dirname, "../../../frontend/dist"),
};
