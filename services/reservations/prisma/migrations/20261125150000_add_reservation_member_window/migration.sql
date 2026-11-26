-- Regulars Club member-window cap (#9628). Additive: one NOT NULL column with a constant default.
ALTER TABLE "reservations" ADD COLUMN "member_window" BOOLEAN NOT NULL DEFAULT false;
