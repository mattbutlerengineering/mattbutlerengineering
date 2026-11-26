-- Regulars Club early window (#9625). Additive: one NOT NULL column with a constant default.
ALTER TABLE "reservation_holds" ADD COLUMN "member_window" BOOLEAN NOT NULL DEFAULT false;
