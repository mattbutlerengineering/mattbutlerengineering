-- Additive-only: one new enum type and one nullable column on an existing
-- table. No existing row changes -- every section keeps NULL, which the app
-- renders exactly as it did before floor materials existed. Nothing is
-- dropped, renamed or re-typed, so this migration is safe to re-run forward
-- against production with no backfill.
--
-- SQL below is `prisma migrate diff` output, unedited.
--
-- ADR-026 note: floor_plan_sections already carries ENABLE + FORCE ROW LEVEL
-- SECURITY and the floor_plan_section_isolation policy, both added alongside
-- the table in 20261022000000_add_floor_plan_sections. Postgres RLS policies
-- are row-level, not column-level, so that policy's USING / WITH CHECK on
-- venue_id governs reads and writes of this new column unchanged, and
-- app_reservations' table-level SELECT/INSERT/UPDATE/DELETE grant already
-- covers it. FORCE is likewise a table property, not a per-column one. So
-- there is no new policy, no re-FORCE and no new GRANT to add here -- the
-- backstop continues to cover the column by construction.

-- CreateEnum
CREATE TYPE "FloorMaterial" AS ENUM ('hardwood', 'concrete', 'carpet', 'tile', 'marble');

-- AlterTable
ALTER TABLE "floor_plan_sections" ADD COLUMN     "floor_material" "FloorMaterial";
