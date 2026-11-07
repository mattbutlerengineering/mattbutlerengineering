-- Additive-only: two columns with constant defaults on an existing table (no table
-- rewrite, no long lock). Every stored row reads as "no scope" (all days its
-- assignment covers, no other hours), which is what it meant before. Nothing is
-- removed, renamed or re-typed, and @@unique([scheduleId, venueServiceId]) stays.
--
-- ADR-026 note: schedule_services already carries its RLS policy and the app role's
-- table-level grants cover the new columns. No new policy, re-FORCE or GRANT is needed.

-- AlterTable
ALTER TABLE "schedule_services" ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "day_hours" JSONB NOT NULL DEFAULT '{"version":1,"sets":[]}';
