-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable: add emailStatus to Reservation
ALTER TABLE "reservations" ADD COLUMN "email_status" "EmailStatus";

-- AlterTable: add unsubscribed to Guest
ALTER TABLE "guests" ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add postVisitEmailEnabled to Venue
ALTER TABLE "venues" ADD COLUMN "post_visit_email_enabled" BOOLEAN NOT NULL DEFAULT false;
