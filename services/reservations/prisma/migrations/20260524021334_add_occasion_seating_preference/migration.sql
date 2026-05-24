-- CreateEnum
CREATE TYPE "Occasion" AS ENUM ('birthday', 'anniversary', 'business', 'date_night', 'other', 'none');

-- CreateEnum
CREATE TYPE "SeatingPreference" AS ENUM ('booth', 'patio', 'bar', 'window', 'quiet', 'no_preference');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "occasion" "Occasion",
ADD COLUMN     "seating_preference" "SeatingPreference";
