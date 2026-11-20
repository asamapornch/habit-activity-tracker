import { prisma } from "../../src/lib/prisma.js";

/**
 * Deletes all rows from the test database only (prisma is configured to use
 * DATABASE_URL_TEST whenever NODE_ENV=test — see src/lib/config.ts).
 * Order matters: children before parents, to satisfy foreign keys.
 */
export async function resetDb() {
  await prisma.entry.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.template.deleteMany();
  await prisma.user.deleteMany();
  // Not a Prisma-managed model (@@ignore'd, see schema.prisma) so it has no
  // deleteMany(); connect-pg-simple owns this table's rows.
  await prisma.$executeRawUnsafe('DELETE FROM "session"');
}
