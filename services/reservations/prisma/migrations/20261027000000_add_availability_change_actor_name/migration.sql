-- Additive-only: one nullable column on an existing table. No existing row
-- changes -- every audit row keeps NULL, which History words as "a teammate"
-- exactly as it did before names were recorded. Nothing is dropped, renamed or
-- re-typed, so this is safe to run forward against production with no backfill.
--
-- ADR-026 note: availability_changes already carries its RLS policy. Policies
-- are row-level, not column-level, so the existing USING / WITH CHECK on
-- venue_id and app_reservations' table-level grants cover this column
-- unchanged. No new policy, re-FORCE or GRANT is needed.

-- AlterTable
ALTER TABLE "availability_changes" ADD COLUMN     "actor_name" TEXT;
