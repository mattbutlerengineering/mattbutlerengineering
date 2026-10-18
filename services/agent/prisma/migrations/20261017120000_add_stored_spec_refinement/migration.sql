-- Point-and-refine stores a refinement as a diff on its parent inside the existing history table.
-- Additive: nullable, no backfill; legacy rows stay NULL.
ALTER TABLE "stored_specs" ADD COLUMN "refinement" JSONB;
