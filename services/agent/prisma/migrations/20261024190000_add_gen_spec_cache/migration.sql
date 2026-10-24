-- Cache of generated specs keyed by a hash of prompt, model, catalog and token cap (#7231). Additive: new table only.
CREATE TABLE "gen_spec_cache" (
    "key" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gen_spec_cache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "gen_spec_cache_created_at_idx" ON "gen_spec_cache"("created_at");
