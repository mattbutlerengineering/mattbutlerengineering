-- A waitlist wait estimate can be genuinely unknown (no table fits the party, or
-- every fitting table is blocked). NULL means "estimate unavailable"; it was
-- previously coerced to 0 minutes. Additive: existing rows keep their values.
ALTER TABLE "waitlist_entries" ALTER COLUMN "estimated_wait_minutes" DROP NOT NULL;
