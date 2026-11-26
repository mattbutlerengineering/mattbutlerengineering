-- Opt-in write scope on personal access tokens (#9778). Additive: one column with a
-- default, so every existing token reads false and stays read-only.

-- AlterTable
ALTER TABLE "personal_access_tokens" ADD COLUMN "can_write" BOOLEAN NOT NULL DEFAULT false;
