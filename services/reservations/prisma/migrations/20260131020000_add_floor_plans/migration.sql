-- CreateTable
CREATE TABLE "floor_plans" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "layout_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_plans_venue_id_idx" ON "floor_plans"("venue_id");

-- CreateIndex
CREATE INDEX "floor_plans_venue_id_is_active_idx" ON "floor_plans"("venue_id", "is_active");

-- AlterTable
ALTER TABLE "tables" ADD COLUMN "table_number" TEXT;
ALTER TABLE "tables" ADD COLUMN "min_covers" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tables" ADD COLUMN "max_covers" INTEGER;
ALTER TABLE "tables" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tables" ADD COLUMN "floor_plan_id" TEXT;
ALTER TABLE "tables" ADD COLUMN "shape_metadata" JSONB;

-- CreateIndex
CREATE INDEX "tables_floor_plan_id_idx" ON "tables"("floor_plan_id");

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_floor_plan_id_fkey" FOREIGN KEY ("floor_plan_id") REFERENCES "floor_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
