-- F-09 (SRS D-20, contract §3.2): additive only. Does not alter any existing table.
-- Written by hand in the same shape `prisma migrate dev` produces; the unrelated
-- "session" drift it also proposes (see the F-06 migration) is left out, as before.
-- CreateTable
CREATE TABLE "reminder_schedules" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "weekdays" INTEGER[],
    "time" CHAR(5) NOT NULL,

    CONSTRAINT "reminder_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_schedules_goalId_key" ON "reminder_schedules"("goalId");

-- AddForeignKey
ALTER TABLE "reminder_schedules" ADD CONSTRAINT "reminder_schedules_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
