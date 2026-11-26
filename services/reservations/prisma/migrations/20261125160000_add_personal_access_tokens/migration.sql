-- Personal access tokens (#9663). Additive: one new table, no change to an existing one.
-- User-scoped, not venue-scoped (like "venue_memberships"), so no RLS policy.
-- Only the SHA-256 hash of a token is stored.

-- CreateTable
CREATE TABLE "personal_access_tokens" (
    "id" TEXT NOT NULL,
    "user_sub" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_access_tokens_token_hash_key" ON "personal_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "personal_access_tokens_user_sub_idx" ON "personal_access_tokens"("user_sub");

GRANT SELECT, INSERT, UPDATE ON TABLE "personal_access_tokens" TO app_reservations;
