-- DropIndex: Remove global unique constraint on venues.slug
DROP INDEX "venues_slug_key";

-- CreateIndex: Add compound unique constraint scoped to venue group
CREATE UNIQUE INDEX "venues_venue_group_id_slug_key" ON "venues"("venue_group_id", "slug");

-- DropIndex: Remove global unique constraint on tables.name
DROP INDEX "tables_name_key";

-- CreateIndex: Add compound unique constraint scoped to venue
CREATE UNIQUE INDEX "tables_venue_id_name_key" ON "tables"("venue_id", "name");
