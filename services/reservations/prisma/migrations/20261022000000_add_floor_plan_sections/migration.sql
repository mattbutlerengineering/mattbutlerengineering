-- Additive-only migration: one new table (floor_plan_sections) and a nullable
-- tables.section_id. No existing data is touched.
-- ADR-026 backstop in the same migration: RLS is ENABLEd and FORCEd with a
-- venue-isolation policy (venue_id NOT NULL), and app_reservations gets full
-- CRUD like the other venue-scoped tables.

-- CreateTable
CREATE TABLE "floor_plan_sections" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "floor_plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#8a8a8a',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plan_sections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "section_id" TEXT;

-- CreateIndex
CREATE INDEX "floor_plan_sections_venue_id_idx" ON "floor_plan_sections"("venue_id");

-- CreateIndex
CREATE INDEX "floor_plan_sections_floor_plan_id_display_order_idx" ON "floor_plan_sections"("floor_plan_id", "display_order");

-- CreateIndex
CREATE INDEX "tables_section_id_idx" ON "tables"("section_id");

-- AddForeignKey
ALTER TABLE "floor_plan_sections" ADD CONSTRAINT "floor_plan_sections_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_sections" ADD CONSTRAINT "floor_plan_sections_floor_plan_id_fkey" FOREIGN KEY ("floor_plan_id") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a section must never delete its tables: they just become unassigned.
-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "floor_plan_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "floor_plan_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "floor_plan_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY floor_plan_section_isolation ON "floor_plan_sections"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "floor_plan_sections" TO app_reservations;
