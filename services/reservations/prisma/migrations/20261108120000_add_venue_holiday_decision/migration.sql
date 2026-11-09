-- A Manager's answer for one holiday that does not change the hours ("open as usual").
-- Additive: one new table. No existing table, column, enum or row changes. `decision` is a string,
-- not an enum, so a later answer needs no migration and an older Prisma client never meets a value
-- its enum does not list.

-- CreateTable
CREATE TABLE "venue_holiday_decisions" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "service_date" DATE NOT NULL,
    "decision" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_holiday_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_holiday_decisions_venue_id_service_date_key" ON "venue_holiday_decisions"("venue_id", "service_date");

-- AddForeignKey
ALTER TABLE "venue_holiday_decisions" ADD CONSTRAINT "venue_holiday_decisions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-026 venue-isolation backstop
ALTER TABLE "venue_holiday_decisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "venue_holiday_decisions" FORCE ROW LEVEL SECURITY;
CREATE POLICY venue_holiday_decision_isolation ON "venue_holiday_decisions"
  FOR ALL
  USING (venue_id = current_setting('app.venue_id', true))
  WITH CHECK (venue_id = current_setting('app.venue_id', true));

-- Full CRUD: a Manager sets and clears a decision. UPDATE is granted although the upsert's update
-- branch is empty, so a later second answer needs no migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "venue_holiday_decisions" TO app_reservations;
