-- Additive-only migration (ADR-030, venue-availability #7500): eight new
-- tables, six new enums, two columns on venues and two on reservations. No
-- existing row changes and nothing is dropped, renamed or re-typed. The data
-- migration from venues.operating_hours is a separate, later migration (#7502).
--
-- Table/column DDL is `prisma migrate diff` output, unedited, except for the
-- hand-written partial unique index and the ADR-026 section at the end.
--
-- ADR-026 backstop in the same migration: every new table has venue_id NOT NULL,
-- ENABLE + FORCE ROW LEVEL SECURITY, a venue-isolation policy, and explicit
-- grants to app_reservations.

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('regular', 'alternate', 'holiday');

-- CreateEnum
CREATE TYPE "DateRuleKind" AS ENUM ('special_hours', 'closure', 'use_schedule', 'skip', 'tonight');

-- CreateEnum
CREATE TYPE "DateRuleTargetKind" AS ENUM ('venue', 'service', 'booking', 'tables');

-- CreateEnum
CREATE TYPE "DateRuleSource" AS ENUM ('manual', 'holiday', 'tonight');

-- CreateEnum
CREATE TYPE "ClosureAction" AS ENUM ('cancel', 'move', 'keep_notify', 'keep_silent');

-- CreateEnum
CREATE TYPE "ClosureRefundStatus" AS ENUM ('none', 'pending', 'done', 'failed');

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "availability_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "host_emergency_close" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "override_limits" TEXT[],
ADD COLUMN     "override_reason" TEXT;

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ScheduleKind" NOT NULL,
    "is_regular" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venue_services" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "venue_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_services" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "venue_service_id" TEXT NOT NULL,
    "opens_at" INTEGER NOT NULL,
    "last_seating_at" INTEGER NOT NULL,
    "closes_at" INTEGER NOT NULL,
    "seating" JSONB NOT NULL,
    "booking_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "schedule_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "starts_on" DATE,
    "ends_on" DATE,
    "precedence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_rules" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "kind" "DateRuleKind" NOT NULL,
    "target_kind" "DateRuleTargetKind" NOT NULL DEFAULT 'venue',
    "venue_service_id" TEXT,
    "booking_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "repeat" JSONB,
    "window" JSONB,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "use_schedule_id" TEXT,
    "series_id" TEXT,
    "source" "DateRuleSource" NOT NULL DEFAULT 'manual',
    "holiday_key" TEXT,
    "booking_opens_at" TIMESTAMP(3),
    "guest_message" VARCHAR(200),
    "staff_note" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "date_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "date_rule_tables" (
    "date_rule_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,

    CONSTRAINT "date_rule_tables_pkey" PRIMARY KEY ("date_rule_id","table_id")
);

-- CreateTable
CREATE TABLE "availability_changes" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "affected_from" DATE,
    "affected_to" DATE,
    "inverse" JSONB NOT NULL,
    "notified_guests" BOOLEAN NOT NULL DEFAULT false,
    "reverted_by" TEXT,

    CONSTRAINT "availability_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closure_outcomes" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "date_rule_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "action" "ClosureAction" NOT NULL,
    "moved_to" TIMESTAMPTZ(3),
    "deliveries" JSONB NOT NULL DEFAULT '{}',
    "refund" "ClosureRefundStatus" NOT NULL DEFAULT 'none',
    "rebooked_reservation_id" TEXT,
    "acknowledged_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closure_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_venue_id_idx" ON "schedules"("venue_id");

-- CreateIndex
CREATE INDEX "venue_services_venue_id_position_idx" ON "venue_services"("venue_id", "position");

-- CreateIndex
CREATE INDEX "schedule_services_venue_id_idx" ON "schedule_services"("venue_id");

-- CreateIndex
CREATE INDEX "schedule_services_venue_service_id_idx" ON "schedule_services"("venue_service_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_services_schedule_id_venue_service_id_key" ON "schedule_services"("schedule_id", "venue_service_id");

-- CreateIndex
CREATE INDEX "schedule_assignments_venue_id_idx" ON "schedule_assignments"("venue_id");

-- CreateIndex
CREATE INDEX "schedule_assignments_schedule_id_idx" ON "schedule_assignments"("schedule_id");

-- CreateIndex
CREATE INDEX "date_rules_venue_id_starts_on_idx" ON "date_rules"("venue_id", "starts_on");

-- CreateIndex
CREATE INDEX "date_rules_venue_service_id_idx" ON "date_rules"("venue_service_id");

-- CreateIndex
CREATE INDEX "date_rules_use_schedule_id_idx" ON "date_rules"("use_schedule_id");

-- CreateIndex
CREATE INDEX "date_rules_series_id_idx" ON "date_rules"("series_id");

-- CreateIndex
CREATE INDEX "date_rule_tables_table_id_idx" ON "date_rule_tables"("table_id");

-- CreateIndex
CREATE INDEX "date_rule_tables_venue_id_idx" ON "date_rule_tables"("venue_id");

-- CreateIndex
CREATE INDEX "availability_changes_venue_id_at_idx" ON "availability_changes"("venue_id", "at");

-- CreateIndex
CREATE INDEX "availability_changes_reverted_by_idx" ON "availability_changes"("reverted_by");

-- CreateIndex
CREATE INDEX "closure_outcomes_venue_id_idx" ON "closure_outcomes"("venue_id");

-- CreateIndex
CREATE INDEX "closure_outcomes_reservation_id_idx" ON "closure_outcomes"("reservation_id");

-- CreateIndex
CREATE INDEX "closure_outcomes_rebooked_reservation_id_idx" ON "closure_outcomes"("rebooked_reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "closure_outcomes_date_rule_id_reservation_id_key" ON "closure_outcomes"("date_rule_id", "reservation_id");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_services" ADD CONSTRAINT "venue_services_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_services" ADD CONSTRAINT "schedule_services_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_services" ADD CONSTRAINT "schedule_services_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_services" ADD CONSTRAINT "schedule_services_venue_service_id_fkey" FOREIGN KEY ("venue_service_id") REFERENCES "venue_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_venue_service_id_fkey" FOREIGN KEY ("venue_service_id") REFERENCES "venue_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_use_schedule_id_fkey" FOREIGN KEY ("use_schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rules" ADD CONSTRAINT "date_rules_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "date_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rule_tables" ADD CONSTRAINT "date_rule_tables_date_rule_id_fkey" FOREIGN KEY ("date_rule_id") REFERENCES "date_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rule_tables" ADD CONSTRAINT "date_rule_tables_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "date_rule_tables" ADD CONSTRAINT "date_rule_tables_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_changes" ADD CONSTRAINT "availability_changes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_changes" ADD CONSTRAINT "availability_changes_reverted_by_fkey" FOREIGN KEY ("reverted_by") REFERENCES "availability_changes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_outcomes" ADD CONSTRAINT "closure_outcomes_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_outcomes" ADD CONSTRAINT "closure_outcomes_date_rule_id_fkey" FOREIGN KEY ("date_rule_id") REFERENCES "date_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_outcomes" ADD CONSTRAINT "closure_outcomes_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closure_outcomes" ADD CONSTRAINT "closure_outcomes_rebooked_reservation_id_fkey" FOREIGN KEY ("rebooked_reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one active regular schedule per venue. Hand-written: Prisma cannot
-- express a partial unique index.
CREATE UNIQUE INDEX "schedules_one_regular_per_venue_key" ON "schedules"("venue_id") WHERE "is_regular" AND "archived_at" IS NULL;

-- ADR-026 venue-isolation backstop
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedules" FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_isolation ON "schedules"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "venue_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "venue_services" FORCE ROW LEVEL SECURITY;
CREATE POLICY venue_service_isolation ON "venue_services"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "schedule_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_services" FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_service_isolation ON "schedule_services"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "schedule_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_assignment_isolation ON "schedule_assignments"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "date_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "date_rules" FORCE ROW LEVEL SECURITY;
CREATE POLICY date_rule_isolation ON "date_rules"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "date_rule_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "date_rule_tables" FORCE ROW LEVEL SECURITY;
CREATE POLICY date_rule_table_isolation ON "date_rule_tables"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "availability_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_changes" FORCE ROW LEVEL SECURITY;
CREATE POLICY availability_change_isolation ON "availability_changes"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

ALTER TABLE "closure_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "closure_outcomes" FORCE ROW LEVEL SECURITY;
CREATE POLICY closure_outcome_isolation ON "closure_outcomes"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- Config tables get full CRUD (date_rules are soft-deleted by the app; the
-- others are edited in place and hard-deleted when a draft is discarded).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "schedules" TO app_reservations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "venue_services" TO app_reservations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "schedule_services" TO app_reservations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "schedule_assignments" TO app_reservations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "date_rules" TO app_reservations;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "date_rule_tables" TO app_reservations;

-- closure_outcomes is an audit record: deliveries / refund / acknowledgement
-- change as retried jobs settle, but rows are never deleted.
GRANT SELECT, INSERT, UPDATE ON TABLE "closure_outcomes" TO app_reservations;

-- availability_changes is append-only: SELECT + INSERT, plus a column-level
-- UPDATE on reverted_by alone (marking a change as undone). No DELETE.
GRANT SELECT, INSERT ON TABLE "availability_changes" TO app_reservations;
GRANT UPDATE ("reverted_by") ON TABLE "availability_changes" TO app_reservations;
