-- AddColumn: dietaryRestrictions to guests table
ALTER TABLE "guests" ADD COLUMN "dietary_restrictions" JSONB;
