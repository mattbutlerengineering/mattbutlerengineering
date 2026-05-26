-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable: Add emailStatus to reservations
ALTER TABLE "reservations" ADD COLUMN "email_status" "EmailStatus";

-- AlterTable: Add unsubscribed to guests
ALTER TABLE "guests" ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false;
