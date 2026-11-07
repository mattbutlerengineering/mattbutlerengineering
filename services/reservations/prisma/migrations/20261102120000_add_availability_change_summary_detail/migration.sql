-- Additive-only: one nullable jsonb column on an existing table. No existing row
-- changes -- every audit row keeps NULL, and a client words a row with no detail
-- from its stored English `summary`, exactly as before. Nothing is dropped,
-- renamed or re-typed, so this is safe to run forward with no backfill (the old
-- summaries are free text and are not parsed back into codes).
--
-- ADR-026 note: availability_changes already carries its RLS policy and
-- app_reservations' table-level SELECT + INSERT grants cover this column
-- unchanged. No new policy, re-FORCE or GRANT is needed.

-- AlterTable
ALTER TABLE "availability_changes" ADD COLUMN     "summary_detail" JSONB;
