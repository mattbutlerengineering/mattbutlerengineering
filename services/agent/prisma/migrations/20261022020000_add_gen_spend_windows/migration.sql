-- Aggregate daily spend counter for the gen routes (#7234). One row per UTC day, incremented atomically.
-- Additive: new table only.
CREATE TABLE "gen_spend_windows" (
    "window_date" DATE NOT NULL,
    "generations" INTEGER NOT NULL DEFAULT 0,
    "cost_micro_usd" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "gen_spend_windows_pkey" PRIMARY KEY ("window_date")
);
