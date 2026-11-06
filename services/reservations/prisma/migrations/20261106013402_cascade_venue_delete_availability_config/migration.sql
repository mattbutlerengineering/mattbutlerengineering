-- DESTRUCTIVE: Drops and re-adds venue_id FK constraints to change ON DELETE RESTRICT to CASCADE for venue config/audit tables (schedules, venue_services, schedule_services, schedule_assignments, date_rules, date_rule_tables, availability_changes). No data is deleted by this migration itself -- it only changes what happens on a future venue delete.
-- DropForeignKey
ALTER TABLE "availability_changes" DROP CONSTRAINT "availability_changes_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "date_rule_tables" DROP CONSTRAINT "date_rule_tables_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "date_rules" DROP CONSTRAINT "date_rules_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "schedule_assignments" DROP CONSTRAINT "schedule_assignments_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "schedule_services" DROP CONSTRAINT "schedule_services_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_venue_id_fkey";

-- DropForeignKey
ALTER TABLE "venue_services" DROP CONSTRAINT "venue_services_venue_id_fkey";

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_services" ADD CONSTRAINT "venue_services_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_services" ADD CONSTRAINT "schedule_services_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rule_tables" ADD CONSTRAINT "date_rule_tables_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_changes" ADD CONSTRAINT "availability_changes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
