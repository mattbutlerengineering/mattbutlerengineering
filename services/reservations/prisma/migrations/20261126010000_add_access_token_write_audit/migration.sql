-- Audit trail for writes made with a write-scoped personal access token (#9780).
-- Additive: one new table, no change to an existing one. Keyed by token, not venue
-- (like "personal_access_tokens"), so no RLS policy; "venue_id" is informational.
-- No foreign key to "personal_access_tokens" on purpose, so audit rows outlive their token.
-- "input" can hold guest notes: it is never logged.

-- CreateTable
CREATE TABLE "access_token_write_audit" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "user_sub" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "venue_id" TEXT,
    "input" JSONB NOT NULL,
    "tool" TEXT,
    "confirm_nonce" TEXT,
    "status_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_token_write_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_token_write_audit_confirm_nonce_key" ON "access_token_write_audit"("confirm_nonce");

-- CreateIndex
CREATE INDEX "access_token_write_audit_token_id_idx" ON "access_token_write_audit"("token_id");

-- CreateIndex
CREATE INDEX "access_token_write_audit_created_at_idx" ON "access_token_write_audit"("created_at");

-- Append-only: the row is inserted before the handler runs, and only the final
-- response status is written afterwards. No DELETE, UPDATE on "status_code" alone.
GRANT SELECT, INSERT ON TABLE "access_token_write_audit" TO app_reservations;
GRANT UPDATE ("status_code") ON TABLE "access_token_write_audit" TO app_reservations;
