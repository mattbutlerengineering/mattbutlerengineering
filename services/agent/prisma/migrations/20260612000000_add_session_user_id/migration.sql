-- Add nullable user_id to sessions for ownership attribution.
-- Additive nullable column only — existing rows and internal/system-created
-- sessions have no owner. No backfill, no destructive operations.
ALTER TABLE "sessions" ADD COLUMN "user_id" TEXT;
