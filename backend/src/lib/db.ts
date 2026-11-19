import { Pool } from "pg";
import { config } from "./config.js";

// A plain `pg` Pool, separate from the Prisma Client (lib/prisma.ts),
// pointed at the same database: connect-pg-simple (lib/session.ts) talks to
// the "session" table directly over this, not through Prisma.
export const pgPool = new Pool({ connectionString: config.databaseUrl });
