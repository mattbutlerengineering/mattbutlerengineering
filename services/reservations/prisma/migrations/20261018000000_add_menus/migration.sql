-- Additive-only migration: three new tables (menus, menu_sections, menu_items), no existing data touched.
-- ADR-026 backstop in the same migration: RLS is ENABLEd and FORCEd with a
-- venue-isolation policy on each table (venue_id NOT NULL on all three), and
-- app_reservations gets full CRUD like the other venue-scoped tables.


-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MenuItemStatus" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'HIDDEN');

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "MenuStatus" NOT NULL DEFAULT 'DRAFT',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sections" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "menu_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "status" "MenuItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menus_venue_id_status_idx" ON "menus"("venue_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "menus_venue_id_slug_key" ON "menus"("venue_id", "slug");

-- CreateIndex
CREATE INDEX "menu_sections_venue_id_idx" ON "menu_sections"("venue_id");

-- CreateIndex
CREATE INDEX "menu_sections_menu_id_display_order_idx" ON "menu_sections"("menu_id", "display_order");

-- CreateIndex
CREATE INDEX "menu_items_venue_id_idx" ON "menu_items"("venue_id");

-- CreateIndex
CREATE INDEX "menu_items_section_id_display_order_idx" ON "menu_items"("section_id", "display_order");

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A price can never be negative (also enforced by the zod schema)
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_cents_check" CHECK ("price_cents" >= 0);

-- ADR-026 venue-isolation backstop
ALTER TABLE "menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menus" FORCE ROW LEVEL SECURITY;
CREATE POLICY menu_isolation ON "menus"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "menu_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_sections" FORCE ROW LEVEL SECURITY;
CREATE POLICY menu_section_isolation ON "menu_sections"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY menu_item_isolation ON "menu_items"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "menus", "menu_sections", "menu_items" TO app_reservations;
