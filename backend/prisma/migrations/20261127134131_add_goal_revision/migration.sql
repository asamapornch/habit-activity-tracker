-- F-06 (SRS D-13, D-14): additive only. Does not alter any existing table.
-- `prisma migrate dev` also proposed unrelated ALTER/RENAME statements on
-- "session" (TEXT/JSONB/index-name drift between the Prisma-ignored Session
-- model's declared types and connect-pg-simple's actual varchar/json/
-- IDX_session_expire schema from the Lab 5 migration) -- removed by hand;
-- F-06 touches only the new goal_revisions table (contract, section 3.2:
-- "Template, User, Entry tables: untouched").
-- CreateTable
CREATE TABLE "goal_revisions" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "dailyTarget" DOUBLE PRECISION NOT NULL,
    "endDate" DATE NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_revisions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "goal_revisions" ADD CONSTRAINT "goal_revisions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
