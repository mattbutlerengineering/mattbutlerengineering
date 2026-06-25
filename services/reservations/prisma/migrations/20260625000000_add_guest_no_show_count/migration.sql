-- AlterTable
ALTER TABLE "guests" ADD COLUMN "no_show_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "guests" ADD COLUMN "last_no_show_at" TIMESTAMP(3);

-- Backfill: count existing NO_SHOW reservations for each guest
UPDATE "guests"
SET "no_show_count" = (
  SELECT COUNT(*)::INTEGER
  FROM "reservations"
  WHERE "reservations"."guest_id" = "guests"."id"
    AND "reservations"."status" = 'NO_SHOW'
);

-- Backfill: set last_no_show_at to the most recent NO_SHOW reservation's start_time
UPDATE "guests"
SET "last_no_show_at" = (
  SELECT MAX("start_time")
  FROM "reservations"
  WHERE "reservations"."guest_id" = "guests"."id"
    AND "reservations"."status" = 'NO_SHOW'
);
