-- Lost Demand reasons (#9621). Additive: four counter columns on no_slot_searches, each defaulting
-- to 0, so existing rows and the existing unique key are untouched. Of `searches`, how many the
-- engine refused for each limiting reason. Still counts only: no guest, session or IP column.

-- AlterTable
ALTER TABLE "no_slot_searches"
  ADD COLUMN "pacing_searches" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tables_searches" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hours_searches" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "closure_searches" INTEGER NOT NULL DEFAULT 0;
