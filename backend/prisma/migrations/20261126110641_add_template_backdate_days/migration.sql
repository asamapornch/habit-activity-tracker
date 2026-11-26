-- Lab 7 (Issue #65, SRS D-12, F-02 v1.7): per-template back-dating limit.
-- Additive only: one nullable integer column, no default and no backfill, so
-- every existing template gets NULL (no limit) and keeps its Sprint 1
-- behaviour. The 0 to 30 range is validated in the API (templates.ts).
ALTER TABLE "templates" ADD COLUMN "backdateDays" INTEGER;
