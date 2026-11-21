import { Pool } from "pg";
import { config } from "./config.js";

// A plain `pg` Pool, separate from the Prisma Client (lib/prisma.ts),
// pointed at the same database: connect-pg-simple (lib/session.ts) talks to
// the "session" table directly over this, not through Prisma.
export const pgPool = new Pool({ connectionString: config.databaseUrl });

// An idle client in the pool can be dropped by the server (e.g. a Cloud SQL
// restart) between requests, which pg surfaces as an "error" event with no
// request in flight. Node's EventEmitter rethrows an unhandled "error" event
// synchronously, which would crash the process; log the message only (never
// the connection string) and let the pool recover the connection itself.
pgPool.on("error", (err) => {
  console.error(`pgPool idle client error: ${err.message}`);
});
