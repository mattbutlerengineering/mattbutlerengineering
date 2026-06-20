-- Migration: add post-visit thank-you email fields
-- Adds emailStatus to Reservation and unsubscribed to Guest

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable: add emailStatus (nullable) to reservations
ALTER TABLE "reservations" ADD COLUMN "email_status" "EmailStatus";

-- AlterTable: add unsubscribed (default false) to guests
ALTER TABLE "guests" ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false;
