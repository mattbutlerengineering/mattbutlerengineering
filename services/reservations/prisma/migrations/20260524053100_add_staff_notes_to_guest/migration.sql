-- Add staff_notes column to guests table
ALTER TABLE "guests" ADD COLUMN "staff_notes" JSONB;
