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
};
