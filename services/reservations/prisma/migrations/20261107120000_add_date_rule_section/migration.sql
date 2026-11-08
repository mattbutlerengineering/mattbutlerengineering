-- ADR-032: a section closure is a `tables` date rule that remembers its section.
-- Additive: one nullable column, no default, no backfill (every existing rule is not a section
-- closure, so NULL is correct), one index, one FK. Nothing is dropped or rewritten.

-- AlterTable
ALTER TABLE "date_rules" ADD COLUMN "section_id" TEXT;

-- CreateIndex
CREATE INDEX "date_rules_section_id_idx" ON "date_rules"("section_id");

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "floor_plan_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
